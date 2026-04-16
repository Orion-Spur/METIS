-- METIS MySQL-compatible starter schema v2
-- Use this on Amazon Aurora MySQL-Compatible.
-- This matches the active METIS application schema so chat recording can begin immediately.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `openId` VARCHAR(64) NOT NULL,
  `name` TEXT NULL,
  `email` VARCHAR(320) NULL,
  `loginMethod` VARCHAR(64) NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_openId_unique` (`openId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `councilSessions` (
  `id` VARCHAR(64) NOT NULL,
  `userId` INT NOT NULL,
  `title` VARCHAR(255) NULL,
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastMessageAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `councilSessions_userId_idx` (`userId`),
  KEY `councilSessions_lastMessageAt_idx` (`lastMessageAt`),
  CONSTRAINT `councilSessions_userId_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `councilMessages` (
  `id` VARCHAR(64) NOT NULL,
  `sessionId` VARCHAR(64) NOT NULL,
  `sequenceOrder` INT NOT NULL,
  `role` ENUM('user', 'agent', 'synthesis') NOT NULL,
  `agentName` ENUM('Metis', 'Athena', 'Argus', 'Loki') NULL,
  `content` TEXT NOT NULL,
  `confidence` DECIMAL(4,2) NULL,
  `recommendedAction` ENUM('proceed', 'revise', 'defer', 'escalate', 'request_clarification') NULL,
  `summaryRationale` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `councilMessages_session_sequence_unique` (`sessionId`, `sequenceOrder`),
  KEY `councilMessages_sessionId_idx` (`sessionId`),
  KEY `councilMessages_createdAt_idx` (`createdAt`),
  KEY `councilMessages_agentName_idx` (`agentName`),
  CONSTRAINT `councilMessages_sessionId_fk`
    FOREIGN KEY (`sessionId`) REFERENCES `councilSessions` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `councilMessages_confidence_range`
    CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

-- IMPORTANT:
-- 1. This schema is for chat/session persistence.
-- 2. The current METIS login is still environment-based, so your login access does not come from a users row yet.
-- 3. To log in now, set JWT_SECRET, METIS_LOGIN_USERNAME, and METIS_LOGIN_PASSWORD (or METIS_LOGIN_PASSWORD_HASH).
