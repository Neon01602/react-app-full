# React + Node.js + MySQL CRUD Account App

Full-stack account application: React + Vite, Node.js + Express, MySQL, JWT cookie authentication, Amazon RDS, and private Amazon S3 profile-picture storage.

## Features
- Register, log in, and log out.
- Read and update the currently authenticated user's own profile (name, email, phone, bio).
- Delete the authenticated user's own account.
- Upload JPG, PNG, or WEBP profile images (maximum 5 MB) to a private S3 bucket.
- Profile image downloads use short-lived signed URLs.
- Passwords use bcrypt hashes and authentication uses an HTTP-only cookie.
- The API derives the user ID from the verified JWT, not a client-supplied ID.

## Local development
1. Install Node.js LTS and MySQL.
2. Run backend/schema.sql in MySQL.
3. Copy backend/.env.example to backend/.env and set local database credentials and a random JWT secret.
4. From the project root run:
   ```bash
   npm run install:all
   npm run dev
   ```
5. Open the Vite URL shown in the terminal (normally http://localhost:5173).

S3 profile-image features require a configured bucket and AWS credentials. Locally, use an AWS CLI profile; on EC2, use an IAM instance role. Never commit .env or AWS access keys.

## Amazon RDS
1. Create an RDS MySQL database in the same VPC as EC2.
2. Set RDS to NOT publicly accessible.
3. RDS security group inbound MySQL TCP 3306 source should be the EC2 instance security group (not 0.0.0.0/0).
4. Set DB_HOST to the RDS endpoint and configure DB_USER, DB_PASSWORD, DB_NAME.
5. Run backend/schema.sql for a new DB. For an existing users table, run backend/migrations/001_add_profile_fields.sql exactly once.
6. Grant the application DB user SELECT, INSERT, UPDATE, DELETE on the application database.

## Amazon S3
1. Create a private S3 bucket in the selected AWS region. Keep Block Public Access enabled.
2. Attach an IAM role to EC2 with s3:PutObject, s3:GetObject, and s3:DeleteObject on arn:aws:s3:::YOUR_BUCKET_NAME/profile-images/*.
3. Set AWS_REGION and S3_BUCKET in backend/.env. Do not put AWS access keys in the app.
4. The server uploads and deletes images using the EC2 role. It generates short-lived signed GET URLs to display images.

## Deployment
Run npm run install:all, npm run build, then npm start (or PM2 as configured). Keep Node port 3000 private behind Nginx. Open only SSH 22 from your IP and HTTP/HTTPS 80/443 as required. Use HTTPS and COOKIE_SECURE=true in production.

## API
- POST /api/register
- POST /api/login
- POST /api/logout
- GET /api/me — read own profile
- PUT /api/me — update own profile
- POST /api/me/avatar — upload own image (multipart field: avatar)
- DELETE /api/me — delete own account
- GET /api/health

Before public production use, add rate limiting, CSRF protection, email verification, password reset, security headers, structured logging, and monitoring.
