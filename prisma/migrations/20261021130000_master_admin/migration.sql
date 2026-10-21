UPDATE "users" SET "role" = 'master', "updatedAt" = CURRENT_TIMESTAMP WHERE LOWER("email") = LOWER('paulo.marrocos@aluguefoco.com.br') AND "role" <> 'master';
