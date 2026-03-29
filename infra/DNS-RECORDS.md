# DNS Records Documentation — Adora Coatings

## IMPORTANT: ACM Certificate Validation CNAME Records

**DO NOT DELETE these records from IONOS DNS.** ACM re-validates the certificate
periodically. If these CNAME records are removed, the certificate renewal will
silently fail and the website HTTPS will eventually break.

After deploying the CloudFormation stack, check the AWS Console:
**AWS Console → Certificate Manager → adoracoatings.com → Domains**

You will see CNAME records like:

| Name                                      | Value                                    |
|-------------------------------------------|------------------------------------------|
| `_<hash>.adoracoatings.com`               | `_<hash>.acm-validations.aws.`           |
| `_<hash>.www.adoracoatings.com`           | `_<hash>.acm-validations.aws.`           |

Add these CNAME records to IONOS DNS. They must stay **permanently**.

---

## Original IONOS DNS Records (backup before cutover)

**Record these before making any DNS changes. Needed for rollback.**

| Type  | Name                    | Value                          | TTL  |
|-------|-------------------------|--------------------------------|------|
| A     | adoracoatings.com       | _(record current value)_       |      |
| CNAME | www.adoracoatings.com   | _(record current value)_       |      |
| MX    | adoracoatings.com       | _(record current value)_       |      |
| TXT   | adoracoatings.com       | _(record current value)_       |      |

**Take a screenshot of all IONOS DNS records as additional backup.**

---

## New DNS Configuration (after cutover)

| Type     | Name                    | Value                                          | TTL  |
|----------|-------------------------|-------------------------------------------------|------|
| CNAME    | www.adoracoatings.com   | `<cloudfront-distribution>.cloudfront.net`      | 300  |
| Redirect | adoracoatings.com       | `https://www.adoracoatings.com` (IONOS redirect)| -    |
| CNAME    | `_<hash>.adoracoatings.com` | `_<hash>.acm-validations.aws.` (ACM)       | 300  |

The CloudFront distribution domain name is in the CloudFormation stack output:
```bash
aws cloudformation describe-stacks \
  --stack-name adora-coatings \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
  --output text
```

---

## Rollback Procedure

If the DNS cutover causes issues:
1. Revert IONOS DNS records to the "Original" values above
2. DNS propagation at 300s TTL means recovery within ~5 minutes
3. Keep ACM validation CNAME records even during rollback
4. The CloudFront distribution and S3 bucket remain intact for re-attempt

---

## Content Update Workflow

1. Edit HTML/CSS/JS files in the `site/` directory
2. Update `sitemap.xml` `<lastmod>` dates for changed pages
3. Run `./infra/deploy.sh`
4. Changes visible within ~60 seconds after CloudFront invalidation
