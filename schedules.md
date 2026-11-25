# List of Schedules

1. Nightly stop for UAT.
   1. UAT should be stopped, if it is running, every night during the stop-start window.
2. Weekly stop-start for PROD.
   1. `RoadmapProdHostRefreshStack` stops `i-0463809a6acf143c7` Saturday 04:00 America/Los_Angeles and starts it at 04:10. That moves the Xen host. UAT is not part of this refresh. `AutoStartStopEc2Stack` stays undeployed.
3. Login and navigation E2E tests twice daily during the week.
   1. These tests will use a headless browser to login, navigate, and perform some end user functions every day twice a day.
   2. Any failures will trigger alarms of two levels of priority. All alarms will initially be configured with high priority.