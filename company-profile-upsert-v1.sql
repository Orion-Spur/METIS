INSERT INTO "companyProfiles" (
  "slug",
  "name",
  "mission",
  "products",
  "customers",
  "constraints",
  "teamSize",
  "stage",
  "operatingModel",
  "geography",
  "createdAt",
  "updatedAt"
)
VALUES (
  'default',
  'Calling All Minds',
  'To unlock human potential by making systems, workplaces, and learning environments accessible, inclusive, and effective for everyone.',
  'AXS Passport (workplace adjustments management), AXS Audit (accessibility assessment and AI-guided remediation), and AXS Toolbar (AI-powered accessibility interface layer).',
  'Large employers and corporates, universities and higher education institutions, public sector organisations, and organisations within the Disability Confident scheme.',
  'Time is limited, cost matters, solutions must be practical and implementable, and unnecessary complexity should be avoided.',
  NULL,
  'Mission-led but commercially driven organisation building scalable accessibility systems.',
  'Combines consultancy, training, and technology products to help organisations move from intention to implementation through practical systems rather than one-off interventions.',
  'UK-based',
  now(),
  now()
)
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "mission" = EXCLUDED."mission",
  "products" = EXCLUDED."products",
  "customers" = EXCLUDED."customers",
  "constraints" = EXCLUDED."constraints",
  "teamSize" = EXCLUDED."teamSize",
  "stage" = EXCLUDED."stage",
  "operatingModel" = EXCLUDED."operatingModel",
  "geography" = EXCLUDED."geography",
  "updatedAt" = now()
RETURNING "slug", "name";
