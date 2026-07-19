import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import crypto from "node:crypto"
import { Buffer } from "node:buffer"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// In-memory cache for the bypassed cookie and timestamp
let cachedCookie: string | null = null;
let lastSolved: number = 0;

/**
 * Parse a byte-array variable assignment from JavaScript source.
 * Matches patterns like: var a=[1,2,3,...];
 */
function parseByteArray(script: string, varName: string): Buffer {
    const toNumbersMatch = script.match(new RegExp(`(?:var\\s+)?${varName}\\s*=\\s*toNumbers\\s*\\(\\s*["']([0-9a-fA-F]+)["']\\s*\\)`));
    if (toNumbersMatch) {
        return Buffer.from(toNumbersMatch[1], 'hex');
    }

    const arrayMatch = script.match(new RegExp(`(?:var\\s+)?${varName}\\s*=\\s*\\[([^\\]]+)\\]`));
    if (arrayMatch) {
        const bytes = arrayMatch[1].split(',').map(s => parseInt(s.trim(), 10));
        return Buffer.from(bytes);
    }

    throw new Error(`Could not parse variable '${varName}' from challenge script`);
}

function toHex(bytes: number[]): string {
    return bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join('');
}

/**
 * Challenge solver for InfinityFree firewall
 */
async function getBypassCookie(baseUrl: string): Promise<string> {
    const now = Date.now();
    if (cachedCookie && (now - lastSolved < 5 * 60 * 60 * 1000)) {
        return cachedCookie;
    }

    try {
        console.log('[CRM Bypass] Fetching page to trigger anti-bot challenge...');
        const res = await fetch(`${baseUrl}/api/v1/Lead`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();

        if (!html.includes('__test')) {
            console.log('[CRM Bypass] No challenge page found, returned direct content.');
            return '';
        }

        console.log('[CRM Bypass] Challenge detected! Solving with crypto...');

        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        if (!scriptMatch) {
            throw new Error('Could not find script block in challenge page');
        }

        const script = scriptMatch[1];

        const key = parseByteArray(script, 'a');
        const iv = parseByteArray(script, 'b');
        const ciphertext = parseByteArray(script, 'c');

        const algorithm = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAutoPadding(false);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const cookieValue = toHex(Array.from(decrypted));

        if (!cookieValue) {
            throw new Error('Failed to solve challenge (cookieValue is empty)');
        }

        cachedCookie = `__test=${cookieValue}`;
        lastSolved = Date.now();
        console.log('[CRM Bypass] Solved successfully! Cookie cached.');
        return cachedCookie;
    } catch (error) {
        console.error('[CRM Bypass] Error solving anti-bot challenge:', error);
        throw error;
    }
}

/**
 * Custom authenticated fetch wrapper for EspoCRM
 */
function getSanitizedBaseUrl(): string {
    let url = Deno.env.get('ESPOCRM_URL') || 'https://uec-admissions.infinityfreeapp.com';
    url = url.trim();
    while (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (url.endsWith('/api/v1')) {
        url = url.slice(0, -7);
    }
    while (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (url.includes('infinityfreeapp.com') && url.startsWith('http://')) {
        url = 'https://' + url.slice(7);
    }
    return url;
}

async function fetchEspo(url: string, options: RequestInit = {}): Promise<Response> {
    const baseUrl = getSanitizedBaseUrl();
    const espoUser = Deno.env.get('ESPOCRM_USERNAME') || 'uec_admin';
    const espoPass = Deno.env.get('ESPOCRM_PASSWORD') || 'ahmeduec123';

    const authHeader = 'Basic ' + Buffer.from(`${espoUser}:${espoPass}`).toString('base64');
    let cookie = await getBypassCookie(baseUrl);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Skip-Duplicate-Check': 'true',
        ...(options.headers as Record<string, string>)
    };

    if (cookie) {
        headers['Cookie'] = cookie;
    }

    let res = await fetch(url, { ...options, headers });
    const bodyText = await res.clone().text();

    if (bodyText.includes('__test')) {
        console.log('[CRM Bypass] Cookie expired or challenged. Resolving again...');
        cachedCookie = null;
        cookie = await getBypassCookie(baseUrl);
        headers['Cookie'] = cookie;
        res = await fetch(url, { ...options, headers });
    }

    return res;
}

/** Sanitize phone number for EspoCRM requirements */
function formatPhoneNumber(phone: string | null | undefined): string {
    if (!phone) return '';
    let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');

    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);

    if (cleaned.startsWith('01') && cleaned.length === 11) return '+2' + cleaned;
    if (cleaned.startsWith('1') && cleaned.length === 10) return '+20' + cleaned;

    const commonCountryCodes = ['20', '966', '971', '965', '974', '973', '968', '962', '961', '212', '216', '218', '249', '964', '963', '967'];
    for (const code of commonCountryCodes) {
        if (cleaned.startsWith(code)) return '+' + cleaned;
    }

    if (cleaned.startsWith('05') && cleaned.length === 10) return '+966' + cleaned.slice(1);

    if (cleaned.startsWith('0')) {
        if (cleaned.length === 11) return '+2' + cleaned;
        return '+' + cleaned;
    }

    return '+' + cleaned;
}

/** Primary entrypoint to sync student application to EspoCRM */
async function syncLeadToEspoCRM(payload: any): Promise<any> {
    const baseUrl = getSanitizedBaseUrl();

    try {
        const studentName = `${payload.first_name_en || ''} ${payload.second_name_en || ''} ${payload.third_name_en || ''} ${payload.last_name_en || ''}`.trim() || 'Prospect';
        console.log(`[CRM Sync] Initiating sync for: ${studentName}`);

        const nameParts = studentName.split(/\s+/);
        const firstName = nameParts[0] || 'Prospect';
        const lastName = nameParts.slice(1).join(' ') || 'Prospect';

        const arabicName = `${payload.first_name_ar || ''} ${payload.second_name_ar || ''} ${payload.third_name_ar || ''} ${payload.last_name_ar || ''}`.trim();
        const originalDate = new Date().toUTCString().replace('GMT', 'UTC');

        const description = `[Registered: ${originalDate}]

Name (EN): ${studentName}
Name (AR): ${arabicName || 'None'}
Email: ${payload.email || 'no-email'}
Phone: ${payload.mobile || 'no-phone'}
Application ID: ${payload.id}
Portal Source: Admission Form
Portal Username: ${payload.portal_username || 'Not Generated'}
Portal Password: ${payload.portal_password || 'Not Generated'}
Faculty Preference 1: ${payload.pref1 || 'Unspecified'}
Faculty Preference 2: ${payload.pref2 || 'Unspecified'}
Faculty Preference 3: ${payload.pref3 || 'Unspecified'}
Applicant Type: ${payload.applicant_type || 'new'}
Intake: ${payload.intake || 'Unspecified'}
Education System: ${payload.edu_system || 'Unspecified'}
School Name: ${payload.school_name === 'Other' ? payload.school_name_other : payload.school_name}
Certificate Country: ${payload.cert_country || 'N/A'}
Graduation Year: ${payload.grad_year || 'Unspecified'}
Final Score: ${payload.score || 'Unspecified'}%
Seat Number: ${payload.seat_number || 'Unspecified'}
Transportation Needed: ${payload.transport_facility || 'no'}
Siblings Enrolled: ${payload.siblings_enrolled === 'yes' ? `Yes (ID: ${payload.sibling_id})` : 'No'}
Father Name: ${payload.father_name || 'Unspecified'}
Father Phone: ${payload.father_mobile || 'Unspecified'}
Father Job Sector: ${payload.father_occupation || 'Unspecified'}
Mother Name: ${payload.mother_name || 'Unspecified'}
Mother Phone: ${payload.mother_mobile || 'Unspecified'}
How Did You Hear: ${(payload.hear_about_us || []).join(', ') || 'Unspecified'}`;

        const crmPayload = {
            firstName,
            lastName,
            emailAddress: payload.email || '',
            phoneNumber: formatPhoneNumber(payload.mobile),
            status: 'New',
            source: 'Web Site', // Set to standard option to pass validation
            description
        };

        let res = await fetchEspo(`${baseUrl}/api/v1/Lead`, {
            method: 'POST',
            body: JSON.stringify(crmPayload)
        });

        let responseBody = await res.text();
        console.log(`[CRM Sync] Response status: ${res.status}`);

        // Fallback validation retry
        let retryCount = 0;
        const fallbackPayload = { ...crmPayload };
        while (res.status === 400 && responseBody.includes('validationFailure') && retryCount < 2) {
            let modified = false;
            if (responseBody.includes('phoneNumber') && fallbackPayload.phoneNumber) {
                console.warn('[CRM Sync] Phone validation failed. Retrying without phone...');
                fallbackPayload.phoneNumber = '';
                modified = true;
            }
            if (responseBody.includes('emailAddress') && fallbackPayload.emailAddress) {
                console.warn('[CRM Sync] Email validation failed. Retrying without email...');
                fallbackPayload.emailAddress = '';
                modified = true;
            }
            if (!modified) break;

            res = await fetchEspo(`${baseUrl}/api/v1/Lead`, {
                method: 'POST',
                body: JSON.stringify(fallbackPayload)
            });
            responseBody = await res.text();
            console.log(`[CRM Sync] Fallback retry ${retryCount + 1} status: ${res.status}`);
            retryCount++;
        }

        if (res.ok) {
            console.log('[CRM Sync] Lead successfully created in EspoCRM!');
            return { success: true, status: res.status, body: responseBody };
        } else {
            console.error(`[CRM Sync] Failed to sync: ${res.status} - ${responseBody}`);
            return { success: false, status: res.status, body: responseBody };
        }
    } catch (err) {
        console.error('[CRM Sync] Error executing EspoCRM sync:', err);
        return { success: false, error: err.message };
    }
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { email, first_name_en, last_name_en, id, sync_only, portal_username, portal_password, resend_copy_to } = payload

    let resData = null;
    const recipientEmail = resend_copy_to || email;
    const recipientName = resend_copy_to ? "Admissions Office (Copy)" : `${first_name_en} ${last_name_en}`;
    const mailSubject = resend_copy_to 
      ? `[Copy] UEC Admission Application Received - ID: ${id}` 
      : `UEC Admission Application Received - ID: ${id}`;
    
    const p_user = resend_copy_to ? "[Saved in CRM]" : (portal_username || 'Generated on Login');
    const p_pass = resend_copy_to ? "[Saved in CRM]" : (portal_password || 'Generated on Login');

    const ccList = [];
    if (!resend_copy_to) {
      ccList.push({
        email: 'enrol@uec.edu.eg',
        name: 'UEC Admissions Office'
      });
    }

    if (!sync_only || resend_copy_to) {
      const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
      if (!BREVO_API_KEY) {
        throw new Error('Missing BREVO_API_KEY environment variable in Supabase')
      }

      // HTML email body with UEC branding, bilingual confirmation content, and logo
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 20px auto; border: 1px solid #e0e6ed; padding: 30px; border-radius: 12px; background-color: #ffffff; color: #2d3748; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        
        <!-- Header / Logo -->
        <div style="text-align: center; border-bottom: 2px solid #C5A358; padding-bottom: 20px; margin-bottom: 30px;">
          <img src="https://uec-admission-portal.pages.dev/white%20back.png" alt="UEC Logo" style="max-height: 80px; width: auto; margin-bottom: 10px;" />
          <h1 style="color: #0A1F3C; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">UNIVERSITY OF EAST CAPITAL</h1>
          <p style="color: #C5A358; margin: 5px 0 0 0; font-size: 13px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Online Admissions Portal</p>
        </div>

        <!-- English Section -->
        <div style="direction: ltr; text-align: left; margin-bottom: 30px;">
          <p style="font-size: 15px; line-height: 1.6; color: #2d3748;">Dear Applicant,</p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #2d3748;">Thank you for completing and submitting your application to the University of East Capital (UEC). Your application number is <strong>${id}</strong>.</p>
          
          <p style="font-size: 15px; line-height: 1.6; font-weight: 700; color: #0A1F3C; margin-top: 20px; border-left: 3px solid #C5A358; padding-left: 8px;">Step 1: Payment of Application Fee</p>
          <p style="font-size: 14px; line-height: 1.6; color: #4a5568;">To confirm your interest and move forward with your application, please pay the required application fee <strong>(EGP 2000)</strong> using <strong>ONE</strong> of the payment methods listed below:</p>
          <ul style="font-size: 14px; line-height: 1.6; color: #4a5568; padding-left: 20px;">
            <li>Bank Account Deposit</li>
            <li style="margin-top: 5px;">InstaPay Transfer</li>
          </ul>

          <p style="font-size: 15px; line-height: 1.6; font-weight: 700; color: #0A1F3C; margin-top: 20px; border-left: 3px solid #C5A358; padding-left: 8px;">Step 2: Submit Proof of Payment</p>
          <p style="font-size: 14px; line-height: 1.6; color: #4a5568;">After completing the payment, you must provide proof by submitting a copy of your deposit slip or InstaPay transfer receipt. This can be done in <strong>ONE</strong> of two ways:</p>
          <ol style="font-size: 14px; line-height: 1.6; color: #4a5568; padding-left: 20px;">
            <li><strong>Email:</strong> Send the document to <a href="mailto:Accounting@uec.edu.eg" style="color: #0A1F3C; font-weight: 600; text-decoration: underline;">Accounting@uec.edu.eg</a></li>
            <li style="margin-top: 5px;"><strong>In-Person:</strong> Hand-deliver the document to the Students Accounts Office on campus (Admissions Building, room no 204).</li>
          </ol>

          <p style="font-size: 14px; line-height: 1.6; color: #4a5568; margin-top: 15px;">Once your payment is received, your application will be officially processed, and our team will follow up with you accordingly.</p>
          <p style="font-size: 14px; line-height: 1.6; color: #4a5568;">Should you have any questions, please do not hesitate to call us at <strong>17523</strong> or email <a href="mailto:admissions@uec.edu.eg" style="color: #0A1F3C; text-decoration: underline;">admissions@uec.edu.eg</a> with your application number in the subject line.</p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #2d3748; margin-top: 20px;">We are excited to welcome you to our community.</p>
        </div>

        <!-- Bilingual Divider -->
        <hr style="border: 0; border-top: 1px solid #e0e6ed; margin: 30px 0;" />

        <!-- Arabic Section -->
        <div style="direction: rtl; text-align: right; margin-bottom: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <p style="font-size: 15px; line-height: 1.8; color: #2d3748;">عزيزي الطالب المتقدم،</p>
          
          <p style="font-size: 15px; line-height: 1.8; color: #2d3748;">شكراً لإتمام وتقديم استمارة التقديم لجامعة شرق العاصمة (UEC). رقم الملف الخاص بك هو <strong>${id}</strong>.</p>
          
          <p style="font-size: 15px; line-height: 1.8; font-weight: 700; color: #0A1F3C; margin-top: 20px; border-right: 3px solid #C5A358; padding-right: 8px;">الخطوة الأولى: سداد رسوم التقديم</p>
          <p style="font-size: 14px; line-height: 1.8; color: #4a5568;">لتأكيد رغبتك في الالتحاق والاستمرار في إجراءات التقديم، يرجى سداد رسوم التقديم المطلوبة وقدرها <strong>(2000 جنيه مصري)</strong> باستخدام <strong>إحدى</strong> طرق الدفع الموضحة أدناه:</p>
          <ul style="font-size: 14px; line-height: 1.8; color: #4a5568; padding-right: 20px;">
            <li>إيداع بنكي في الحساب.</li>
            <li style="margin-top: 5px;">تحويل عبر تطبيق إنستاباي InstaPay.</li>
          </ul>

          <p style="font-size: 15px; line-height: 1.8; font-weight: 700; color: #0A1F3C; margin-top: 20px; border-right: 3px solid #C5A358; padding-right: 8px;">الخطوة الثانية: تقديم إثبات الدفع</p>
          <p style="font-size: 14px; line-height: 1.8; color: #4a5568;">بعد إتمام عملية السداد، يجب عليك تقديم إثبات الدفع (إيصال الإيداع البنكي أو إيصال تحويل InstaPay) بإحدى الطريقتين التاليتين:</p>
          <ol style="font-size: 14px; line-height: 1.8; color: #4a5568; padding-right: 20px;">
            <li><strong>البريد الإلكتروني:</strong> إرسال المستند إلى <a href="mailto:Accounting@uec.edu.eg" style="color: #0A1F3C; font-weight: 600; text-decoration: underline;">Accounting@uec.edu.eg</a></li>
            <li style="margin-top: 5px;"><strong>الحضور شخصياً:</strong> تسليم الإيصال إلى مكتب حسابات الطلاب بالحرم الجامعي – مبنى التقديمات – غرفة 204.</li>
          </ol>

          <p style="font-size: 14px; line-height: 1.8; color: #4a5568; margin-top: 15px;">بمجرد تأكيد الدفع، سيتم البدء رسمياً في ملف القبول الخاص بك وسيتواصل معك فريق القبول لاحقاً.</p>
          <p style="font-size: 14px; line-height: 1.8; color: #4a5568;">إذا كان لديك أي استفسارات، يرجى التواصل معنا على الرقم <strong>17523</strong> أو عبر البريد الإلكتروني <a href="mailto:admissions@uec.edu.eg" style="color: #0A1F3C; text-decoration: underline;">admissions@uec.edu.eg</a> مع كتابة رقم ملف التقديم الخاص بك في خانة الموضوع.</p>
          
          <p style="font-size: 15px; line-height: 1.8; color: #2d3748; margin-top: 20px;">يسعدنا الترحيب بكم ونتطلع إلى انضمامكم إلى مجتمعنا الجامعي.</p>
          <p style="font-size: 14px; line-height: 1.8; color: #2d3748; font-weight: bold; margin-top: 10px;">مع أطيب التمنيات،<br/>فريق القبول – جامعة شرق العاصمة</p>
        </div>

        <!-- Student Portal Credentials -->
        <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-left: 4px solid #C5A358; padding: 20px; margin: 25px 0; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: #0A1F3C; font-size: 15px; font-weight: 700; text-align: left; border-bottom: 1px solid #edf2f7; padding-bottom: 8px;">Student Portal Credentials / بيانات الدخول لبوابة الطالب</h4>
          <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #4a5568; text-align: left;">
            You can use the following temporary credentials to log in to your UEC student portal:
            <br>
            يمكنك استخدام البيانات المؤقتة التالية لتسجيل الدخول إلى بوابة الطالب الخاصة بك بجامعة UEC:
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #4a5568; line-height: 1.6;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #0A1F3C; width: 35%; text-align: left;">Portal Username / الاسم:</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 14px; font-weight: bold; color: #C5A358; text-align: left;">${p_user}</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 6px 0; font-weight: bold; color: #0A1F3C; text-align: left;">Temporary Password / المرور:</td>
              <td style="padding: 6px 0; font-family: monospace; font-size: 14px; font-weight: bold; color: #C5A358; text-align: left;">${p_pass}</td>
            </tr>
          </table>
        </div>

        <!-- Bank Details Section -->
        <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-left: 4px solid #C5A358; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="margin: 0 0 15px 0; color: #0A1F3C; font-size: 14px; text-transform: uppercase; font-weight: 700; text-align: center; border-bottom: 1px solid #edf2f7; padding-bottom: 8px;">Bank Account Details / بيانات الحساب البنكي</h4>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse; color: #4a5568; line-height: 1.6;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 35%; text-align: left;">Bank Name:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold; width: 35%;">اسم البنك:</td>
              <td style="padding: 6px 0; padding-left: 10px; font-weight: 600; color: #0A1F3C;">Misr Bank (بنك مصر)</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 6px 0; font-weight: bold; text-align: left;">Account Name:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold;">اسم الحساب:</td>
              <td style="padding: 6px 0; padding-left: 10px; font-size: 12px;">Tanmia for Educational Platforms<br/>تنمية للمنصات التعليمية</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 6px 0; font-weight: bold; text-align: left;">Account Number:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold;">رقم الحساب:</td>
              <td style="padding: 6px 0; padding-left: 10px; font-family: monospace; font-size: 14px; font-weight: bold; color: #0A1F3C;">7700001000011062</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 6px 0; font-weight: bold; text-align: left;">IBAN:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold;">رقم الآيبان:</td>
              <td style="padding: 6px 0; padding-left: 10px; font-family: monospace; font-size: 13px; font-weight: bold; color: #0A1F3C;">EG740002077007700001000011062</td>
            </tr>
          </table>
        </div>

        <!-- Footer / Contact Block -->
        <div style="background-color: #0A1F3C; color: #ffffff; border-radius: 8px; padding: 25px; margin-top: 30px; font-size: 13px; line-height: 1.6;">
          <h4 style="margin: 0 0 15px 0; color: #C5A358; font-size: 14px; text-transform: uppercase; font-weight: 700; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Contact Information / معلومات الاتصال</h4>
          <table style="width: 100%; border-collapse: collapse; color: #ffffff;">
            <tr>
              <td style="padding: 5px 0; font-weight: bold; width: 35%;">Hotline:</td>
              <td style="padding: 5px 0;"><a href="tel:17523" style="color: #C5A358; text-decoration: none; font-weight: bold;">17523</a></td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; vertical-align: top;">Mobile Numbers:</td>
              <td style="padding: 5px 0; color: #e2e8f0;">
                01505123666 / 01515429232 / <br/>
                01515429239 / 01505123555
              </td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">WhatsApp:</td>
              <td style="padding: 5px 0;"><a href="https://wa.me/201505123555" style="color: #C5A358; text-decoration: none; font-weight: bold;">01505123555</a></td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Admission Email:</td>
              <td style="padding: 5px 0;"><a href="mailto:admissions@uec.edu.eg" style="color: #C5A358; text-decoration: none;">admissions@uec.edu.eg</a></td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">Website:</td>
              <td style="padding: 5px 0;"><a href="https://www.uec.edu.eg" target="_blank" style="color: #C5A358; text-decoration: none;">www.uec.edu.eg</a></td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; vertical-align: top;">Address:</td>
              <td style="padding: 5px 0; color: #cbd5e0; font-size: 12px;">KM 31 Cairo - Ismailia Desert Road, Cairo-Egypt</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; font-size: 11px; color: #a0aec0; margin-top: 30px; line-height: 1.5;">
          <p style="margin: 0 0 5px 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 0;">&copy; 2026 University of East Capital. All rights reserved.</p>
        </div>
      </div>
    `

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: 'UEC Admissions',
          email: 'enrol@uec.edu.eg',
        },
        to: [
          {
            email: recipientEmail,
            name: recipientName,
          }
        ],
        cc: ccList.length > 0 ? ccList : undefined,
        subject: mailSubject,
        htmlContent: emailHtml,
      }),
    })

      resData = await res.json()

      if (!res.ok) {
        throw new Error(`Brevo API error: ${JSON.stringify(resData)}`)
      }
    }

    // Attempt to sync the lead to EspoCRM asynchronously in the background.
    // Wrap it in a try-catch so CRM sync issues never block the client-side success screen.
    let crmResult = null;
    if (!resend_copy_to) {
        try {
            console.log('[CRM Sync] Triggering background sync to EspoCRM...');
            crmResult = await syncLeadToEspoCRM(payload);
        } catch (crmErr) {
            crmResult = { success: false, error: crmErr.message };
            console.error('[CRM Sync] Failed to sync to EspoCRM:', crmErr);
        }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully', data: resData, crmResult }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
