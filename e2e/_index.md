---
title: Automating End-to-End Integration Testing
date: 2025-08-28
summary: Regular automated end-t0-end (e2e) tests are the only assurance of product consistency.
---

## Scheduling

The e2e tests should run every weekday morning at 04:00 PDT

## Local First

Before these tests are deployed in the CDK to run automatically on the schedule, we have to be able to run each at will locally against the Dev environment. We should also be able to run them locally against the PROD environment.

## Local Data

```mysql
mysql> select user_id, username, email, first_name, last_name from users where user_id = 727;
+---------+-----------+---------------------+------------+-----------+
| user_id | username  | email               | first_name | last_name |
+---------+-----------+---------------------+------------+-----------+
|     727 | test-user | mark@getbizkite.com | Test       | Test      |
+---------+-----------+---------------------+------------+-----------+
1 row in set (0.01 sec)
```

The current local test user is a temporary solution. Once we create the tests for "Add User" and "Remove User" we will be able to create a user for each test that needs a user. This pre-populated test user allows us to avoid that step for a little while.

## Screenshots and Record

* Every page result should be screenshotted.
* Store all data in a daily dated bucket folder.
* Record data values in CSV or the most structured data storage for the task.

## Needed Tests

* [X] ~~*Login*~~ [2025-08-28]
  * [X] ~~**Forgot Password**~~ [2025-08-31]
    * [X] ~~Fill out form with test user from DB.~~
    * [X] ~~Verify that the users password was reset and `Password_reset` == 1 in the DB.~~
  * [ ] Forgot Username
* [ ] Home
* [ ] About Us
* [ ] Contact Us
* [ ] Change Password
* [ ] Edit Profile
* [ ] nav-tabs
  * [ ] Client Profile
  * [ ] Retirement Planner
  * [ ] Widow Planner
  * [ ] Tax Trap
  * [ ] Retirement Tax Analyzer
  * [ ] RTA Training/Welcome
  * [ ] **College Planner**
    * [ ] Fill in two children's data.
    * [ ] Press Calculate
    * [ ] Check that both children's data appears
    * [ ] Check that the combined summary data appears
  * [ ] Cash Flow
  * [ ] PRSPlan
  * [ ] Resources
  * [ ] STD Reports
  * [ ] RTA Reports
  * [ ] Admin
  * [ ] Promo Code