-- Run once against the existing reactcrud database.
-- Adds a Luma address to each account and stores mailbox metadata.
ALTER TABLE users ADD COLUMN luma_email VARCHAR(254) NULL;
CREATE UNIQUE INDEX uq_users_luma_email ON users (luma_email);

CREATE TABLE IF NOT EXISTS mail_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  direction ENUM('inbound','outbound') NOT NULL,
  folder ENUM('inbox','sent','drafts') NOT NULL,
  from_address VARCHAR(254) NOT NULL,
  to_json JSON NOT NULL,
  cc_json JSON NULL,
  bcc_json JSON NULL,
  subject VARCHAR(998) NOT NULL DEFAULT '',
  text_body MEDIUMTEXT NULL,
  html_body MEDIUMTEXT NULL,
  raw_s3_key VARCHAR(1024) NULL,
  status ENUM('draft','queued','sent','received','failed') NOT NULL DEFAULT 'received',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at DATETIME NULL,
  received_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mail_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_mail_user_folder_created (user_id, folder, created_at),
  INDEX idx_mail_provider_id (provider_message_id)
);
