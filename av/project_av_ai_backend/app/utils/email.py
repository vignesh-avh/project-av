# project_av_ai_backend/app/utils/email.py

import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# REMOVED 'async' from the function definition
def send_otp_email(to_email: str, otp: str):
    print(f"--- DEBUG: Preparing to send OTP '{otp}' to {to_email} ---")

    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    sender_email = os.getenv("SENDER_EMAIL")

    if not sendgrid_api_key or not sender_email:
        print("ERROR: SENDGRID_API_KEY and SENDER_EMAIL must be set in .env")
        return

    message = Mail(
        from_email=sender_email,
        to_emails=to_email,
        subject='Your Verification Code',
        html_content=f'<strong>Your OTP is: {otp}</strong><p>It will expire in 10 minutes.</p>'
    )
    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        # REMOVED 'await' from the function call
        response = sg.send(message)
        print(f"Email sent to {to_email}, status code: {response.status_code}")
    except Exception as e:
        print(f"Error sending email: {e}")