import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { email, first_name_en, last_name_en, id } = payload

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
            email: email,
            name: `${first_name_en} ${last_name_en}`,
          }
        ],
        subject: `UEC Admission Application Received - ID: ${id}`,
        htmlContent: emailHtml,
      }),
    })

    const resData = await res.json()

    if (!res.ok) {
      throw new Error(`Brevo API error: ${JSON.stringify(resData)}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully', data: resData }),
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
