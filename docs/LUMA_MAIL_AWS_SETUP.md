# Luma Mail — AWS SES setup

This feature branch adds the application-side mail API and inbound worker. It does not activate mail delivery until you own a domain and complete the AWS setup below.

## Architecture

- Outbound: authenticated Express API -> Amazon SES v2 SendEmail API.
- Inbound: domain MX -> SES receipt rule -> private S3 raw-message object -> S3 event -> SQS -> PM2 inbound worker -> parsed message metadata/body in RDS.
- The existing S3 profile-image bucket remains separate. Create a dedicated inbound-mail bucket.
- The app assigns each account a Luma address under LUMA_MAIL_DOMAIN when the user row is provisioned (migration and provisioning are a deployment step).

## Required AWS setup

1. Own a domain (for example, luma.example). A domain is not included with SES.
2. In SES in eu-north-1, create a domain identity and publish the SES verification and Easy DKIM DNS records at your DNS provider.
3. Request SES production access in eu-north-1. In the sandbox, recipients must be verified and sending is restricted.
4. Create a dedicated private S3 bucket for raw inbound MIME messages. Keep Block Public Access enabled.
5. Create an SQS standard queue and its queue policy allowing the S3 bucket to send notifications. Configure an S3 event notification for ObjectCreated on the inbound bucket, targeting that queue.
6. Configure SES Email receiving in eu-north-1. Publish an MX record for the mail domain pointing to inbound-smtp.eu-north-1.amazonaws.com. Create and activate a receipt rule set with an S3 action that stores raw messages in the inbound bucket. SES needs s3:PutObject permission on that bucket.
7. Attach IAM permissions to the existing EC2 role:
   - ses:SendEmail (resource restricted to the verified SES identity ARN)
   - s3:GetObject on inbound bucket object keys
   - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes on the inbound queue
   - Existing profile-image S3 permissions remain.
8. Set the variables from backend/.env.mail.example in backend/.env.
9. Run backend/migrations/002_luma_mail.sql against the existing reactcrud database.
10. Provision a unique luma_email for every existing user (for example, ahmad@yourdomain.com). Do not use a shared catch-all mapping without validating recipient ownership.
11. Start the worker with PM2: pm2 start inbound-worker.js --name luma-inbound-worker; then pm2 save.
12. Add a DNS MX record at the domain root exactly as shown by the SES receiving endpoint for eu-north-1. Avoid MX records that point to a different mail provider for the same hostname.

## Operational notes

- The inbound worker stores parsed text/HTML and the S3 key in RDS; raw MIME remains in S3.
- Add retention/lifecycle rules for raw email objects, monitoring, bounce/complaint handling, abuse controls, per-user sending limits, and rate limiting before public launch.
- Never expose AWS credentials to React. The backend uses the EC2 instance role.
- Configure HTTPS and secure cookies before production.
