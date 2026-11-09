# CloudFront migration status

Date: 2026-11-08

## Final state

- UAT CloudFront stack deployed: `RoadmapUatCloudFrontStack`
- UAT distribution ID: `EPWMUQJ15W7EC`
- UAT distribution domain: `d90cg1g1o1qka.cloudfront.net`
- UAT hostname: `uat.roadmappartners.net`
- UAT origin protocol policy: `HTTPS_ONLY`

- PROD CloudFront stack deployed: `RoadmapProdCloudFrontStack`
- PROD distribution ID: `E1ZLFPYRU6TZWD`
- PROD distribution domain: `d13wmzeg1p1w52.cloudfront.net`
- PROD hostname: `roadmappartners.net`
- PROD origin protocol policy: `HTTPS_ONLY`

- ACM certificate (us-east-1):
  - `arn:aws:acm:us-east-1:865664998993:certificate/a3c6ca37-90df-4d09-aecb-183a06dc0650`

## DNS

- UAT Route53 alias was previously cut to CloudFront and validated.
- PROD Route53 apex A record was updated from direct EC2 IP `184.72.30.45` to CloudFront on 2026-11-08.
- Route53 change submitted for PROD cutover:
  - `/change/C06772743UDTZYDJF6IJR`

## Validation summary

- `https://uat.roadmappartners.net/roadmap/login.html` served successfully through CloudFront/ACM.
- `https://roadmappartners.net/roadmap/login.html` returned `200` through CloudFront after PROD cutover.
- `https://roadmappartners.net/roadmap/pricing.html` returned `200` through CloudFront.
- Registration page endpoint on PROD allows `GET, POST`; `HEAD` returns `405`, so browser/GET validation should be used instead of HEAD-only checks.

## Notes

- The PROD app/origin requires the correct host header; direct requests to the raw CloudFront domain may return `502` while alias-hosted traffic works correctly.
- Remaining smoke-test improvements are test-suite follow-up work, not blockers for the CloudFront/ACM migration itself.
