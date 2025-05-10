# List of Schedules

1. Nightly stop for UAT.
   1. UAT should be stopped, if it is running, every night during the stop-start window.
2. Weekly stop-start for UAT and PROD.
   1. UAT and PROD should both be stopped fully, and then PROD should be restarted during the stop-start window. This is to apply AWS AMI updates, if any.
3. Login and navigation E2E tests twice daily during the week.
   1. These tests will use a headless browser to login, navigate, and perform some end user functions every day twice a day.
   2. Any failures will trigger alarms of two levels of priority. All alarms will initially be configured with high priority.