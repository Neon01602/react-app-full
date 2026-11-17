# React + Node.js + MySQL Login App

A small full-stack login/register application:
- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** MySQL
- **Authentication:** bcrypt password hashing + JWT in an HTTP-only cookie

## 1. Requirements

Install:
- Node.js LTS (includes npm)
- MySQL Server (or MySQL on your EC2 instance)
- Git is optional

Check Node/npm:
```bash
node -v
npm -v
```

## 2. Create the MySQL database and user

Open MySQL Workbench or the MySQL command line as an administrator, then run:

```sql
CREATE DATABASE login_app
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'login_app'@'localhost' IDENTIFIED BY 'Choose_A_Strong_Password';
GRANT SELECT, INSERT ON login_app.* TO 'login_app'@'localhost';
FLUSH PRIVILEGES;
```

Then select the `login_app` database and run the contents of `backend/schema.sql` (or execute its `CREATE TABLE` statement). If you used the full schema file, it also creates/selects the database; create the MySQL user separately.

If your Node backend runs on a different machine from MySQL, create a MySQL user restricted to that backend machine's IP instead of `localhost`, and configure MySQL networking/firewall securely. Do **not** expose port 3306 to the public internet.

## 3. Configure the backend

From the project root:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell, use:
```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=login_app
DB_PASSWORD=Choose_A_Strong_Password
DB_NAME=login_app
JWT_SECRET=paste_a_long_random_secret_here_at_least_32_characters
COOKIE_SECURE=false
```

Generate a random secret if needed:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output into `JWT_SECRET`. Never commit `.env` to Git.

## 4. Install dependencies

From the project root:
```bash
npm install
npm run install:all
```

## 5. Run locally

Open a terminal in the project root:
```bash
npm run dev
```

- React frontend: http://localhost:5173
- Node API: http://localhost:3000
- API/database health check: http://localhost:3000/api/health

Open the frontend URL, choose **Create account**, register, then sign out and sign back in. Each account is inserted into MySQL. Passwords are stored as bcrypt hashes, not plain text.

## 6. How the pieces connect

```text
Browser (React :5173)
       |
       | fetch /api/login or /api/register
       v
Vite development proxy
       |
       v
Node + Express (:3000)
       |
       | mysql2 connection pool / SQL queries
       v
MySQL database (login_app -> users table)
```

The React app calls `/api/...`. During development Vite forwards those requests to Node on port 3000. Node verifies credentials against MySQL and sends a signed JWT in an HTTP-only cookie. The browser sends that cookie automatically on later requests.

## 7. Build and run as one Node service

```bash
npm run build
npm start
```

The backend serves the compiled React app from `frontend/dist`. Open `http://localhost:3000`.

## 8. Deploying to your Ubuntu EC2 server

1. Install Node.js LTS and MySQL Server (or use a separate managed MySQL host).
2. Copy/clone this project onto EC2.
3. Create the MySQL database, table, and restricted database user as above.
4. Create `backend/.env` on EC2. Set `DB_HOST` to `localhost` if MySQL is on the same EC2 machine. Use `COOKIE_SECURE=true` once the site is served over HTTPS.
5. In the project directory run:
   ```bash
   npm install
   npm run install:all
   npm run build
   npm start
   ```
6. For a persistent deployment, run the backend with a process manager such as PM2 or configure a `systemd` service.
7. Put Nginx in front of Node and proxy public HTTP/HTTPS traffic to `127.0.0.1:3000`. Keep Node's port 3000 and MySQL's port 3306 closed to the public; allow web traffic on ports 80/443.
8. Configure HTTPS before setting `COOKIE_SECURE=true`.

## Important production notes

This is a learning starter, not a complete production identity platform. Before public production use, add rate limiting, CSRF protection appropriate to your deployment, email verification, password reset, stricter security headers, logging/monitoring, and HTTPS. Keep database credentials and JWT secrets out of source control. Use a least-privilege MySQL account and regular database backups.
