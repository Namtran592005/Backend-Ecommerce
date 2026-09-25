-- ============================================================
-- UniMate E-commerce Database
-- Production-oriented MySQL 8.0+ schema for Vietnam
-- Charset: utf8mb4 | Engine: InnoDB
-- Money: DECIMAL(15,2) VND | Timestamps stored as UTC
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `unimate`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `unimate`;

-- =========================
-- SYSTEM / RBAC
-- =========================

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS admin_activity_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS user_addresses;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NULL,
  status ENUM('pending','active','inactive','suspended','deleted') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME(6) NULL,
  phone_verified_at DATETIME(6) NULL,
  last_login_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_status (status),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE user_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  display_name VARCHAR(200) NULL,
  avatar_url VARCHAR(1000) NULL,
  date_of_birth DATE NULL,
  gender ENUM('male','female','other','unknown') NOT NULL DEFAULT 'unknown',
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(100) NULL,
  recipient_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  province_code VARCHAR(30) NULL,
  province_name VARCHAR(150) NOT NULL,
  district_code VARCHAR(30) NULL,
  district_name VARCHAR(150) NULL,
  ward_code VARCHAR(30) NULL,
  ward_name VARCHAR(150) NULL,
  address_line VARCHAR(500) NOT NULL,
  postal_code VARCHAR(20) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_addresses_user (user_id),
  KEY idx_addresses_default (user_id, is_default),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  session_token_hash CHAR(64) NOT NULL,
  refresh_token_hash CHAR(64) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(1000) NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (session_token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key VARCHAR(150) NOT NULL,
  setting_value JSON NOT NULL,
  description VARCHAR(500) NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notification_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('email','sms','push','in_app') NOT NULL,
  event_code VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, channel, event_code),
  CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSON NULL,
  read_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE admin_activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT UNSIGNED NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(1000) NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_admin_activity_actor (actor_user_id, created_at),
  KEY idx_admin_activity_entity (entity_type, entity_id),
  CONSTRAINT fk_admin_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_audit_actor_created (actor_user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =========================
-- CATALOG
-- =========================

DROP TABLE IF EXISTS variant_attribute_values;
DROP TABLE IF EXISTS product_attributes;
DROP TABLE IF EXISTS attribute_values;
DROP TABLE IF EXISTS attributes;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS media_files;

CREATE TABLE media_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NULL,
  storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
  object_key VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(150) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  checksum_sha256 CHAR(64) NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_object (storage_provider, object_key),
  KEY idx_media_owner (owner_user_id),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE brands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(250) NOT NULL,
  description TEXT NULL,
  logo_media_id BIGINT UNSIGNED NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_brands_slug (slug),
  KEY idx_brands_status (status),
  CONSTRAINT fk_brands_logo FOREIGN KEY (logo_media_id) REFERENCES media_files(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(250) NOT NULL,
  description TEXT NULL,
  image_media_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_parent (parent_id),
  KEY idx_categories_status_sort (status, sort_order),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_categories_image FOREIGN KEY (image_media_id) REFERENCES media_files(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  brand_id BIGINT UNSIGNED NULL,
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(350) NOT NULL,
  description LONGTEXT NULL,
  short_description TEXT NULL,
  product_type ENUM('physical','digital','service') NOT NULL DEFAULT 'physical',
  status ENUM('draft','active','inactive','archived') NOT NULL DEFAULT 'draft',
  base_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  compare_at_price DECIMAL(15,2) NULL,
  cost_price DECIMAL(15,2) NULL,
  sku VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  weight_grams INT UNSIGNED NULL,
  tax_class VARCHAR(50) NULL,
  seo_title VARCHAR(255) NULL,
  seo_description VARCHAR(500) NULL,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_brand (brand_id),
  KEY idx_products_status_created (status, created_at),
  KEY idx_products_barcode (barcode),
  CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE product_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100) NULL,
  name VARCHAR(300) NULL,
  price DECIMAL(15,2) NOT NULL,
  compare_at_price DECIMAL(15,2) NULL,
  cost_price DECIMAL(15,2) NULL,
  weight_grams INT UNSIGNED NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_variants_sku (sku),
  UNIQUE KEY uq_variants_barcode (barcode),
  KEY idx_variants_product_status (product_id, status),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_categories (
  product_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (product_id, category_id),
  KEY idx_pc_category (category_id, product_id),
  CONSTRAINT fk_pc_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,
  media_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  alt_text VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_product_images_product (product_id, sort_order),
  KEY idx_product_images_variant (variant_id),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_images_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_product_images_media FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE attributes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL,
  display_type ENUM('text','color','image','number') NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attributes_code (code)
) ENGINE=InnoDB;

CREATE TABLE attribute_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attribute_id BIGINT UNSIGNED NOT NULL,
  value VARCHAR(200) NOT NULL,
  display_value VARCHAR(200) NULL,
  color_hex CHAR(7) NULL,
  image_media_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attribute_value (attribute_id, value),
  KEY idx_attribute_values_attribute (attribute_id, sort_order),
  CONSTRAINT fk_attr_values_attribute FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE,
  CONSTRAINT fk_attr_values_media FOREIGN KEY (image_media_id) REFERENCES media_files(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE product_attributes (
  product_id BIGINT UNSIGNED NOT NULL,
  attribute_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, attribute_id),
  CONSTRAINT fk_product_attributes_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_attributes_attribute FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE variant_attribute_values (
  variant_id BIGINT UNSIGNED NOT NULL,
  attribute_value_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (variant_id, attribute_value_id),
  CONSTRAINT fk_vav_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_vav_value FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- INVENTORY / WAREHOUSE
-- =========================

DROP TABLE IF EXISTS inventory_adjustment_items;
DROP TABLE IF EXISTS inventory_adjustments;
DROP TABLE IF EXISTS stock_reservations;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS warehouse_stocks;
DROP TABLE IF EXISTS warehouse_transfers;
DROP TABLE IF EXISTS warehouses;

CREATE TABLE warehouses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  address TEXT NULL,
  province_code VARCHAR(30) NULL,
  district_code VARCHAR(30) NULL,
  ward_code VARCHAR(30) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_warehouses_code (code)
) ENGINE=InnoDB;

CREATE TABLE warehouse_stocks (
  warehouse_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (warehouse_id, variant_id),
  CONSTRAINT fk_ws_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ws_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT chk_ws_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_ws_reserved CHECK (reserved_quantity >= 0)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  type ENUM('purchase','sale','return','adjustment','transfer_in','transfer_out','reservation','release','damage','loss') NOT NULL,
  quantity INT NOT NULL,
  reference_type VARCHAR(60) NULL,
  reference_id BIGINT UNSIGNED NULL,
  note TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_stock_movements_variant (variant_id, created_at),
  KEY idx_stock_movements_warehouse (warehouse_id, created_at),
  KEY idx_stock_movements_reference (reference_type, reference_id),
  CONSTRAINT fk_sm_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_sm_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_sm_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE stock_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('active','released','converted','expired') NOT NULL DEFAULT 'active',
  expires_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_reservations_order (order_id),
  KEY idx_reservations_variant_status (variant_id, status),
  KEY idx_reservations_expiry (status, expires_at),
  CONSTRAINT fk_reservations_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_reservations_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  CONSTRAINT chk_reservation_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE warehouse_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transfer_number VARCHAR(50) NOT NULL,
  source_warehouse_id BIGINT UNSIGNED NOT NULL,
  destination_warehouse_id BIGINT UNSIGNED NOT NULL,
  status ENUM('draft','requested','approved','in_transit','received','cancelled') NOT NULL DEFAULT 'draft',
  note TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  approved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_transfer_number (transfer_number),
  KEY idx_transfers_status (status),
  CONSTRAINT fk_transfer_source FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_transfer_destination FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_transfer_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_transfer_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_transfer_different_warehouses CHECK (source_warehouse_id <> destination_warehouse_id)
) ENGINE=InnoDB;

CREATE TABLE inventory_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  adjustment_number VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('draft','posted','cancelled') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  posted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  posted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_adjustment_number (adjustment_number),
  CONSTRAINT fk_adjustment_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_adjustment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_adjustment_poster FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE inventory_adjustment_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  adjustment_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  old_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  difference_quantity INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_adjustment_variant (adjustment_id, variant_id),
  CONSTRAINT fk_adjustment_items_adjustment FOREIGN KEY (adjustment_id) REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjustment_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB;

-- =========================
-- CART / WISHLIST
-- =========================

DROP TABLE IF EXISTS wishlist_items;
DROP TABLE IF EXISTS wishlists;
DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS carts;

CREATE TABLE carts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  session_id VARCHAR(255) NULL,
  status ENUM('active','converted','abandoned') NOT NULL DEFAULT 'active',
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_carts_session (session_id),
  KEY idx_carts_user_status (user_id, status),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_variant (cart_id, variant_id),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  CONSTRAINT chk_cart_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE wishlists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL DEFAULT 'Yêu thích',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_user_name (user_id, name),
  CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE wishlist_items (
  wishlist_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (wishlist_id, product_id),
  CONSTRAINT fk_wishlist_items_wishlist FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- ORDERS
-- =========================

DROP TABLE IF EXISTS order_notes;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS order_addresses;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(50) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  status ENUM('pending','confirmed','processing','packed','shipping','delivered','completed','cancelled','returned','refunded') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid','pending','paid','partially_refunded','refunded','failed') NOT NULL DEFAULT 'unpaid',
  fulfillment_status ENUM('unfulfilled','partial','fulfilled','returned') NOT NULL DEFAULT 'unfulfilled',
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  item_discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  order_discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  shipping_discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  shipping_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  customer_note TEXT NULL,
  admin_note TEXT NULL,
  coupon_code VARCHAR(100) NULL,
  placed_at DATETIME(6) NULL,
  cancelled_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_user_created (user_id, created_at),
  KEY idx_orders_status_created (status, created_at),
  KEY idx_orders_payment_status (payment_status, created_at),
  KEY idx_orders_fulfillment_status (fulfillment_status, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_orders_amounts CHECK (
    subtotal >= 0 AND item_discount_amount >= 0 AND order_discount_amount >= 0
    AND shipping_discount_amount >= 0 AND shipping_fee >= 0
    AND tax_amount >= 0 AND total_amount >= 0
  )
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  variant_id BIGINT UNSIGNED NULL,
  product_name_snapshot VARCHAR(300) NOT NULL,
  variant_name_snapshot VARCHAR(300) NULL,
  sku_snapshot VARCHAR(100) NULL,
  image_url_snapshot VARCHAR(1000) NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  KEY idx_order_items_variant (variant_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE order_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  address_type ENUM('billing','shipping') NOT NULL,
  recipient_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  province_code VARCHAR(30) NULL,
  province_name VARCHAR(150) NOT NULL,
  district_code VARCHAR(30) NULL,
  district_name VARCHAR(150) NULL,
  ward_code VARCHAR(30) NULL,
  ward_name VARCHAR(150) NULL,
  address_line VARCHAR(500) NOT NULL,
  postal_code VARCHAR(20) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_address_type (order_id, address_type),
  CONSTRAINT fk_order_addresses_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(50) NULL,
  to_status VARCHAR(50) NOT NULL,
  note TEXT NULL,
  changed_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_order_history_order (order_id, created_at),
  CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NULL,
  note TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_order_notes_order (order_id, created_at),
  CONSTRAINT fk_order_notes_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_notes_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =========================
-- PAYMENTS / REFUNDS
-- =========================

DROP TABLE IF EXISTS refund_items;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_methods;

CREATE TABLE payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  provider VARCHAR(100) NULL,
  type ENUM('cod','bank_transfer','gateway','card','wallet','other') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  config JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_methods_code (code)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','processing','paid','failed','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
  amount DECIMAL(15,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  provider_payment_id VARCHAR(255) NULL,
  paid_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_payments_order (order_id),
  KEY idx_payments_provider_id (provider_payment_id),
  KEY idx_payments_status (status, created_at),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  transaction_type ENUM('authorize','capture','charge','refund','void','verify','webhook') NOT NULL,
  status ENUM('pending','success','failed') NOT NULL,
  idempotency_key VARCHAR(255) NULL,
  provider_transaction_id VARCHAR(255) NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  request_payload JSON NULL,
  response_payload JSON NULL,
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(500) NULL,
  processed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_tx_idempotency (idempotency_key),
  KEY idx_payment_tx_payment (payment_id, created_at),
  KEY idx_payment_tx_provider (provider_transaction_id),
  CONSTRAINT fk_payment_tx_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  refund_number VARCHAR(50) NOT NULL,
  status ENUM('requested','approved','processing','completed','failed','cancelled') NOT NULL DEFAULT 'requested',
  reason VARCHAR(500) NULL,
  amount DECIMAL(15,2) NOT NULL,
  provider_refund_id VARCHAR(255) NULL,
  requested_by BIGINT UNSIGNED NULL,
  approved_by BIGINT UNSIGNED NULL,
  processed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refunds_number (refund_number),
  KEY idx_refunds_order (order_id),
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_refunds_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_refunds_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE refund_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  refund_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refund_item (refund_id, order_item_id),
  CONSTRAINT fk_refund_items_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB;

-- =========================
-- SHIPPING
-- =========================

DROP TABLE IF EXISTS shipment_tracking_events;
DROP TABLE IF EXISTS shipment_items;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS shipping_methods;
DROP TABLE IF EXISTS shipping_providers;

CREATE TABLE shipping_providers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipping_providers_code (code)
) ENGINE=InnoDB;

CREATE TABLE shipping_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_id BIGINT UNSIGNED NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  base_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  config JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipping_methods_code (code),
  CONSTRAINT fk_shipping_methods_provider FOREIGN KEY (provider_id) REFERENCES shipping_providers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  shipping_method_id BIGINT UNSIGNED NULL,
  warehouse_id BIGINT UNSIGNED NULL,
  tracking_number VARCHAR(150) NULL,
  status ENUM('pending','ready','picked_up','in_transit','out_for_delivery','delivered','failed','returned','cancelled') NOT NULL DEFAULT 'pending',
  shipping_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  cod_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  label_url VARCHAR(1000) NULL,
  external_shipment_id VARCHAR(255) NULL,
  shipped_at DATETIME(6) NULL,
  delivered_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_shipments_order (order_id),
  KEY idx_shipments_tracking (tracking_number),
  KEY idx_shipments_status (status, created_at),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipments_method FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE SET NULL,
  CONSTRAINT fk_shipments_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE shipment_items (
  shipment_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  PRIMARY KEY (shipment_id, order_item_id),
  CONSTRAINT fk_shipment_items_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipment_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB;

CREATE TABLE shipment_tracking_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shipment_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  location VARCHAR(255) NULL,
  occurred_at DATETIME(6) NOT NULL,
  raw_payload JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_tracking_events_shipment (shipment_id, occurred_at),
  CONSTRAINT fk_tracking_events_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- PROMOTIONS / COUPONS
-- =========================

DROP TABLE IF EXISTS promotion_categories;
DROP TABLE IF EXISTS promotion_products;
DROP TABLE IF EXISTS promotion_variants;
DROP TABLE IF EXISTS coupon_redemptions;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS promotions;

CREATE TABLE promotions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NULL,
  description TEXT NULL,
  type ENUM('percentage','fixed','buy_x_get_y','free_shipping','bundle') NOT NULL,
  value DECIMAL(15,2) NULL,
  minimum_order_amount DECIMAL(15,2) NULL,
  maximum_discount_amount DECIMAL(15,2) NULL,
  usage_limit INT UNSIGNED NULL,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at DATETIME(6) NULL,
  ends_at DATETIME(6) NULL,
  priority INT NOT NULL DEFAULT 0,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('draft','scheduled','active','inactive','expired') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_promotions_code (code),
  KEY idx_promotions_status_time (status, starts_at, ends_at),
  CONSTRAINT fk_promotions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE promotion_products (
  promotion_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, product_id),
  CONSTRAINT fk_promotion_products_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT fk_promotion_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_variants (
  promotion_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, variant_id),
  CONSTRAINT fk_promotion_variants_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT fk_promotion_variants_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_categories (
  promotion_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, category_id),
  CONSTRAINT fk_promotion_categories_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  CONSTRAINT fk_promotion_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL,
  type ENUM('fixed','percentage','free_shipping') NOT NULL,
  value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  minimum_order_amount DECIMAL(15,2) NULL,
  maximum_discount_amount DECIMAL(15,2) NULL,
  usage_limit INT UNSIGNED NULL,
  usage_limit_per_user INT UNSIGNED NULL,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at DATETIME(6) NULL,
  expires_at DATETIME(6) NULL,
  status ENUM('draft','active','inactive','expired') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code),
  KEY idx_coupons_status_time (status, starts_at, expires_at),
  CONSTRAINT fk_coupons_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE coupon_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_amount DECIMAL(15,2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_order (coupon_id, order_id),
  KEY idx_coupon_redemptions_user (coupon_id, user_id, created_at),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

-- =========================
-- RETURNS / REVIEWS
-- =========================

DROP TABLE IF EXISTS return_status_history;
DROP TABLE IF EXISTS return_items;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS review_votes;
DROP TABLE IF EXISTS review_images;
DROP TABLE IF EXISTS reviews;

CREATE TABLE returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  return_number VARCHAR(50) NOT NULL,
  status ENUM('requested','approved','rejected','customer_shipping','received','inspecting','accepted','partially_accepted','refunded','cancelled') NOT NULL DEFAULT 'requested',
  reason_code VARCHAR(80) NOT NULL,
  reason_detail TEXT NULL,
  customer_note TEXT NULL,
  admin_note TEXT NULL,
  requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  approved_at DATETIME(6) NULL,
  received_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_returns_number (return_number),
  KEY idx_returns_order (order_id),
  KEY idx_returns_status (status, created_at),
  CONSTRAINT fk_returns_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_returns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE return_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  requested_quantity INT UNSIGNED NOT NULL,
  accepted_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  condition_code VARCHAR(80) NULL,
  inspection_note TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_order_item (return_id, order_item_id),
  CONSTRAINT fk_return_items_return FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_return_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB;

CREATE TABLE return_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(80) NULL,
  to_status VARCHAR(80) NOT NULL,
  note TEXT NULL,
  changed_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_return_history (return_id, created_at),
  CONSTRAINT fk_return_history_return FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_return_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  order_item_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  title VARCHAR(200) NULL,
  content TEXT NULL,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('pending','published','hidden','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_reviews_product_status (product_id, status, created_at),
  KEY idx_reviews_user (user_id, created_at),
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE review_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_review_images_review (review_id, sort_order),
  CONSTRAINT fk_review_images_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_images_media FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE review_votes (
  review_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  vote ENUM('helpful','not_helpful') NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (review_id, user_id),
  CONSTRAINT fk_review_votes_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- INVOICES / ACCOUNTING-LIKE LEDGER
-- =========================

DROP TABLE IF EXISTS cash_flows;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS invoice_items;

CREATE TABLE invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  invoice_number VARCHAR(80) NOT NULL,
  status ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
  buyer_name VARCHAR(255) NULL,
  buyer_company_name VARCHAR(255) NULL,
  buyer_tax_code VARCHAR(50) NULL,
  buyer_email VARCHAR(255) NULL,
  buyer_address VARCHAR(500) NULL,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  issued_at DATETIME(6) NULL,
  cancelled_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_number (invoice_number),
  UNIQUE KEY uq_invoices_order (order_id),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NULL,
  description VARCHAR(500) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(15,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_invoice_items_invoice (invoice_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cash_flows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('income','expense','refund','shipping_cost','purchase','adjustment') NOT NULL,
  reference_type VARCHAR(80) NULL,
  reference_id BIGINT UNSIGNED NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  description VARCHAR(500) NULL,
  occurred_at DATETIME(6) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_cash_flows_date (occurred_at),
  KEY idx_cash_flows_reference (reference_type, reference_id),
  CONSTRAINT fk_cash_flows_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =========================
-- MARKETING / CONTENT
-- =========================

DROP TABLE IF EXISTS campaign_products;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS banners;

CREATE TABLE campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('draft','scheduled','active','paused','ended') NOT NULL DEFAULT 'draft',
  starts_at DATETIME(6) NULL,
  ends_at DATETIME(6) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_campaigns_status_time (status, starts_at, ends_at),
  CONSTRAINT fk_campaigns_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE campaign_products (
  campaign_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (campaign_id, product_id),
  CONSTRAINT fk_campaign_products_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaign_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE banners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  image_media_id BIGINT UNSIGNED NULL,
  mobile_image_media_id BIGINT UNSIGNED NULL,
  link_url VARCHAR(1000) NULL,
  alt_text VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('draft','active','inactive') NOT NULL DEFAULT 'draft',
  starts_at DATETIME(6) NULL,
  ends_at DATETIME(6) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_banners_status_time (status, starts_at, ends_at),
  CONSTRAINT fk_banners_image FOREIGN KEY (image_media_id) REFERENCES media_files(id) ON DELETE SET NULL,
  CONSTRAINT fk_banners_mobile_image FOREIGN KEY (mobile_image_media_id) REFERENCES media_files(id) ON DELETE SET NULL,
  CONSTRAINT fk_banners_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =========================
-- SEED: RBAC + PAYMENT/SHIPPING
-- =========================

INSERT INTO roles (code, name, description, is_system) VALUES
('super_admin','Super Admin','Toàn quyền quản trị',TRUE),
('store_manager','Store Manager','Quản lý cửa hàng',TRUE),
('warehouse_staff','Warehouse Staff','Nhân viên kho',TRUE),
('customer_support','Customer Support','Chăm sóc khách hàng',TRUE),
('marketing','Marketing','Quản lý marketing',TRUE),
('customer','Customer','Khách hàng',TRUE);

INSERT INTO permissions (code, name) VALUES
('users.read','Xem người dùng'),
('users.write','Quản lý người dùng'),
('products.read','Xem sản phẩm'),
('products.write','Quản lý sản phẩm'),
('categories.write','Quản lý danh mục'),
('orders.read','Xem đơn hàng'),
('orders.write','Quản lý đơn hàng'),
('payments.read','Xem thanh toán'),
('payments.write','Quản lý thanh toán'),
('inventory.read','Xem kho'),
('inventory.write','Quản lý kho'),
('shipping.read','Xem vận chuyển'),
('shipping.write','Quản lý vận chuyển'),
('promotions.read','Xem khuyến mãi'),
('promotions.write','Quản lý khuyến mãi'),
('returns.read','Xem đổi trả'),
('returns.write','Quản lý đổi trả'),
('reviews.write','Quản lý đánh giá'),
('reports.read','Xem báo cáo'),
('settings.write','Quản lý cấu hình'),
('audit.read','Xem audit log');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'super_admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p
WHERE r.code = 'store_manager'
  AND p.code IN (
    'users.read','products.read','products.write','categories.write',
    'orders.read','orders.write','payments.read','payments.write',
    'inventory.read','inventory.write','shipping.read','shipping.write',
    'promotions.read','promotions.write','returns.read','returns.write',
    'reviews.write','reports.read'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p
WHERE r.code = 'warehouse_staff'
  AND p.code IN ('products.read','orders.read','inventory.read','inventory.write','shipping.read','shipping.write');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p
WHERE r.code = 'customer_support'
  AND p.code IN ('users.read','products.read','orders.read','orders.write','payments.read','returns.read','returns.write','reviews.write');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p
WHERE r.code = 'marketing'
  AND p.code IN ('products.read','categories.write','promotions.read','promotions.write','reports.read');

INSERT INTO payment_methods (code,name,provider,type,is_active,sort_order) VALUES
('cod','Thanh toán khi nhận hàng',NULL,'cod',TRUE,1),
('bank_transfer','Chuyển khoản ngân hàng',NULL,'bank_transfer',TRUE,2),
('vnpay','VNPay','VNPay','gateway',TRUE,3),
('momo','MoMo','MoMo','wallet',TRUE,4),
('zalopay','ZaloPay','ZaloPay','wallet',TRUE,5),
('card','Thẻ ngân hàng','Gateway','card',TRUE,6);

INSERT INTO shipping_providers (code,name,is_active) VALUES
('manual','Vận chuyển thủ công',TRUE),
('ghtk','Giao Hàng Tiết Kiệm',FALSE),
('ghn','Giao Hàng Nhanh',FALSE),
('viettel_post','Viettel Post',FALSE),
('jnt','J&T Express',FALSE);

INSERT INTO system_settings (setting_key, setting_value, description, is_public) VALUES
('store.currency','"VND"','Đơn vị tiền tệ',TRUE),
('store.timezone','"Asia/Ho_Chi_Minh"','Múi giờ hiển thị',TRUE),
('order.auto_cancel_minutes','30','Thời gian giữ đơn chưa thanh toán',FALSE),
('inventory.reservation_minutes','30','Thời gian giữ tồn kho',FALSE),
('review.max_rating','5','Điểm đánh giá tối đa',TRUE);

-- =========================
-- PRODUCTION VIEWS
-- =========================

DROP VIEW IF EXISTS v_available_stock;
CREATE VIEW v_available_stock AS
SELECT
  ws.warehouse_id,
  ws.variant_id,
  ws.quantity,
  ws.reserved_quantity,
  (ws.quantity - ws.reserved_quantity) AS available_quantity,
  ws.reorder_level
FROM warehouse_stocks ws;

DROP VIEW IF EXISTS v_order_totals;
CREATE VIEW v_order_totals AS
SELECT
  o.id,
  o.order_number,
  o.user_id,
  o.status,
  o.payment_status,
  o.fulfillment_status,
  o.subtotal,
  o.item_discount_amount,
  o.order_discount_amount,
  o.shipping_discount_amount,
  o.shipping_fee,
  o.tax_amount,
  o.total_amount,
  o.created_at
FROM orders o;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- IMPLEMENTATION NOTES
-- 1. Never trust client-side prices; recalculate totals server-side.
-- 2. Checkout MUST run in a DB transaction.
-- 3. Lock warehouse_stocks rows with SELECT ... FOR UPDATE before
--    reserving/releasing/decrementing inventory.
-- 4. Payment webhooks MUST be idempotent using idempotency_key/provider ID.
-- 5. Do not hard-delete orders, payments, refunds, invoices or audit data.
-- 6. Store immutable order snapshots in order_items/order_addresses.
-- 7. Store UTC in DB; convert to Asia/Ho_Chi_Minh at presentation/API layer.
-- 8. Never store raw card data, CVV, passwords, or payment secrets.
-- 9. Product/category/user soft deletion is handled by deleted_at/status
--    where historical integrity requires it.
-- 10. Add application-level authorization; DB schema alone is not security.
-- ============================================================
