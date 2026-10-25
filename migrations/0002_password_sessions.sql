CREATE TRIGGER owner_password_sessions AFTER UPDATE OF password ON owner BEGIN
 DELETE FROM sessions;
END;
