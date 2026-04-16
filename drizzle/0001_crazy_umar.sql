CREATE TABLE `councilMessages` (
	`id` varchar(64) NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`sequenceOrder` int NOT NULL,
	`role` enum('user','agent','synthesis') NOT NULL,
	`agentName` enum('Metis','Athena','Argus','Loki'),
	`content` text NOT NULL,
	`confidence` decimal(4,2),
	`recommendedAction` enum('proceed','revise','defer','escalate','request_clarification'),
	`summaryRationale` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `councilMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `councilSessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255),
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `councilSessions_id` PRIMARY KEY(`id`)
);
