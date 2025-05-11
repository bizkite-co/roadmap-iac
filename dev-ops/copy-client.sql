SET @OLD_CLIENT_ID = CLIENT_ID_PARAM;
SET @MY_USER_ID = 65;

INSERT INTO client
(user_id, first_name, last_name, age, gender, state, updated_by, updated_on, active, temp)
select @MY_USER_ID, first_name, last_name, age, gender, state, updated_by, updated_on, active, temp
FROM client
WHERE id = @OLD_CLIENT_ID;

SET @NEW_CLIENT_ID = LAST_INSERT_ID();
SELECT @NEW_CLIENT_ID;

INSERT INTO roadmap
(
    client_id, version, timestamp, URIR, ABR, LAR, RIIR, ASIR,
    QPA_CAV, QPA_CAC, QPA_YCC, QPA_YCC99, QPA_ARR, NQPA_CAV, NQPA_CAC, NQPA_YCC,
    NQPA_YCC99, NQPA_ARR, CEITR, EITRR, SSCALC, MSSB, SSCOLA,
    SSAGE, GGEA, SGEA, SGP, NGP, GGP, additional_capital_required,
    amount_save_annually, first_year_annual_gap, strategy, leave_behind, total_gross_income,
    life_insurance_CAC, life_insurance_YCC, life_insurance_YCC99, disability_insurance_CAC,
    disability_insurance_YCC, disability_insurance_YCC99, total_other_living_expenses, long_term_care_CAC,
    long_term_care_YCC, long_term_care_YCC99, perm_life_insurance_CAC, perm_life_insurance_YCC,
    perm_life_insurance_YCC99
)
SELECT 
    @NEW_CLIENT_ID, version, timestamp, URIR, ABR, LAR, RIIR,
    ASIR, QPA_CAV, QPA_CAC, QPA_YCC, QPA_YCC99, QPA_ARR, NQPA_CAV, NQPA_CAC,
    NQPA_YCC, NQPA_YCC99, NQPA_ARR, CEITR, EITRR, SSCALC, MSSB, SSCOLA,
    SSAGE, GGEA, SGEA, SGP, NGP, GGP, additional_capital_required, amount_save_annually,
    first_year_annual_gap, strategy, leave_behind, total_gross_income, life_insurance_CAC,
    life_insurance_YCC, life_insurance_YCC99, disability_insurance_CAC, disability_insurance_YCC,
    disability_insurance_YCC99, total_other_living_expenses, long_term_care_CAC, long_term_care_YCC,
    long_term_care_YCC99, perm_life_insurance_CAC, perm_life_insurance_YCC, perm_life_insurance_YCC99
FROM roadmap
WHERE client_id = @OLD_CLIENT_ID;

INSERT INTO passive_income_item
(
    client_id, `description`, `value`, tax_rate, year_to_begin, is_continue_until_death, years_to_continue
)
SELECT 
    @NEW_CLIENT_ID, `description`, `value`, tax_rate, year_to_begin, is_continue_until_death, years_to_continue
FROM passive_income_item
WHERE client_id = @OLD_CLIENT_ID;

INSERT INTO asset_item
(
    client_id, `description`, `value`, is_tax_qualified
)
SELECT 
    @NEW_CLIENT_ID, `description`, `value`, is_tax_qualified
FROM asset_item
WHERE client_id = @OLD_CLIENT_ID;