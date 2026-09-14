-- Demo schema for exercising db-insight against MySQL.
-- MySQL has no schema tier above the database, so everything lives in `demo`.

-- Index usage statistics live in performance_schema, which an ordinary user
-- cannot read by default. The app degrades gracefully without this, but
-- granting it lets the index-usage panel show real numbers in development.
GRANT SELECT ON performance_schema.* TO 'dbinsight'@'%';

USE demo;

CREATE TABLE customers (
    customer_id  INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    email        VARCHAR(200) COMMENT 'Primary contact address',
    country      CHAR(2)      NOT NULL DEFAULT 'US',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id     INT AUTO_INCREMENT PRIMARY KEY,
    sku            VARCHAR(40)  NOT NULL,
    name           VARCHAR(200) NOT NULL,
    unit_price     DECIMAL(10, 2) NOT NULL,
    -- A stored generated column, so the DDL viewer has one to render
    price_with_tax DECIMAL(12, 4) GENERATED ALWAYS AS (unit_price * 1.2) STORED,
    discontinued   TINYINT(1) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX ix_products_sku ON products (sku);
CREATE INDEX ix_products_price ON products (unit_price);

CREATE TABLE orders (
    order_id    INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    ordered_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total       DECIMAL(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id) ON DELETE CASCADE
);

CREATE INDEX ix_orders_customer ON orders (customer_id);

CREATE TABLE order_lines (
    order_line_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id      INT NOT NULL,
    product_id    INT NOT NULL,
    quantity      INT NOT NULL DEFAULT 1,
    line_total    DECIMAL(12, 2) NOT NULL,
    CONSTRAINT fk_lines_order FOREIGN KEY (order_id)
        REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_lines_product FOREIGN KEY (product_id)
        REFERENCES products (product_id)
);

CREATE INDEX ix_order_lines_order ON order_lines (order_id);

CREATE VIEW v_customer_totals AS
SELECT c.customer_id, c.name, COUNT(o.order_id) AS order_count,
       COALESCE(SUM(o.total), 0) AS lifetime_value
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name;

DELIMITER $$

CREATE FUNCTION customer_order_count(p_customer_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE result INT;
    SELECT COUNT(*) INTO result FROM orders WHERE customer_id = p_customer_id;
    RETURN result;
END$$

CREATE PROCEDURE recalculate_order_total(IN p_order_id INT)
BEGIN
    UPDATE orders o
    SET o.total = COALESCE(
        (SELECT SUM(line_total) FROM order_lines WHERE order_id = p_order_id), 0)
    WHERE o.order_id = p_order_id;
END$$

-- Seed rows with a loop, since MySQL has no generate_series
CREATE PROCEDURE seed_demo_data()
BEGIN
    DECLARE i INT DEFAULT 1;

    WHILE i <= 500 DO
        INSERT INTO customers (name, email, country)
        VALUES (CONCAT('Customer ', i), CONCAT('customer', i, '@example.com'),
                IF(i % 3 = 0, 'GB', 'US'));
        SET i = i + 1;
    END WHILE;

    SET i = 1;
    WHILE i <= 300 DO
        INSERT INTO products (sku, name, unit_price, discontinued)
        VALUES (CONCAT('SKU-', LPAD(i, 5, '0')), CONCAT('Product ', i),
                (i % 200) + 9.99, i % 17 = 0);
        SET i = i + 1;
    END WHILE;

    SET i = 1;
    WHILE i <= 2000 DO
        INSERT INTO orders (customer_id, total) VALUES ((i % 500) + 1, 0);
        SET i = i + 1;
    END WHILE;

    SET i = 1;
    WHILE i <= 6000 DO
        INSERT INTO order_lines (order_id, product_id, quantity, line_total)
        VALUES ((i % 2000) + 1, (i % 300) + 1, (i % 5) + 1,
                ((i % 5) + 1) * ((i % 200) + 9.99));
        SET i = i + 1;
    END WHILE;

    UPDATE orders o
    SET o.total = COALESCE(
        (SELECT SUM(line_total) FROM order_lines l WHERE l.order_id = o.order_id), 0);
END$$

DELIMITER ;

CALL seed_demo_data();
DROP PROCEDURE seed_demo_data;

-- Refresh the row-count estimates that information_schema reports
ANALYZE TABLE customers, products, orders, order_lines;
