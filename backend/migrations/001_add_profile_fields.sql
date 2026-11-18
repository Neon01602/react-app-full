-- Run ONCE against an existing login_app database before deploying the CRUD version.
USE login_app;
ALTER TABLE users
  ADD COLUMN phone VARCHAR(25) NULL,
  ADD COLUMN bio VARCHAR(500) NULL,
  ADD COLUMN profile_image_key VARCHAR(512) NULL;
