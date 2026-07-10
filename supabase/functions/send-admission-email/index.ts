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

    // HTML email body with UEC styling and student details
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #e0e6ed; padding: 40px; border-radius: 12px; background-color: #ffffff; color: #2d3748; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align: center; border-bottom: 2px solid #C5A358; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="color: #0A1F3C; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">UNIVERSITY OF EAST CAPITAL</h1>
          <p style="color: #C5A358; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Admissions Portal</p>
        </div>

        <p style="font-size: 16px; line-height: 1.6; color: #2d3748;">Dear <strong>${first_name_en} ${last_name_en}</strong>,</p>
        
        <p style="font-size: 15px; line-height: 1.6; color: #4a5568;">Thank you for submitting your application to the <strong>University of East Capital (UEC)</strong>. We are pleased to confirm that we have successfully received your registration details.</p>
        
        <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-left: 4px solid #C5A358; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #718096; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Your Application ID:</p>
          <p style="margin: 0; font-size: 20px; font-weight: 700; color: #0A1F3C; font-family: monospace;">${id}</p>
        </div>

        <div style="margin: 25px 0;">
          <h3 style="color: #0A1F3C; font-size: 16px; margin-top: 0; border-bottom: 1px solid #edf2f7; padding-bottom: 8px;">Next Steps:</h3>
          <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; line-height: 1.8; color: #4a5568;">
            <li><strong>Application Review</strong>: Our admissions team is currently reviewing your uploaded documents and credentials.</li>
            <li><strong>Portal Access</strong>: You can check your email to access the UEC Student Portal to track updates.</li>
            <li><strong>Check Spam/Junk</strong>: Please make sure to check your Junk or Spam email folders if you do not receive further communications in your Inbox.</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 35px 0 20px 0;">
          <a href="https://uec-admission-portal.pages.dev" target="_blank" style="background-color: #0A1F3C; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 15px; font-weight: 600; border-radius: 6px; border: 1px solid #0A1F3C; display: inline-block; transition: all 0.2s;">Visit UEC Portal</a>
        </div>

        <hr style="border: 0; border-top: 1px solid #e0e6ed; margin: 30px 0;" />
        
        <div style="text-align: center; font-size: 12px; color: #a0aec0; line-height: 1.5;">
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
          email: 'uuecadmission@gmail.com',
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
