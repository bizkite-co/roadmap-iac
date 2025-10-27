SELECT COUNT(*)
FROM users u
INNER JOIN client c
ON u.user_id = c.user_id
WHERE u.active = 1
AND u.username NOT IN ('joelrta')
AND u.email NOT LIKE '%test%'
AND u.last_name NOT LIKE '%test%'
AND u.first_name NOT LIKE '%test%'
AND u.last_name NOT IN ('solomon', 'gerber', 'user');
