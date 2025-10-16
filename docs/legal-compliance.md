# Legal Compliance Guide

This document outlines legal considerations and compliance requirements for the AthleteMetrics platform.

## Overview

AthleteMetrics is an athlete performance tracking platform that collects, stores, and analyzes personal data including measurements, photos, and demographic information. This creates several legal obligations, especially when dealing with minors.

## Critical Legal Requirements

### 1. Minor Protection (COPPA & State Laws)

**COPPA (Children's Online Privacy Protection Act)**:
- Applies to users under 13 years old
- Requires verifiable parental consent before collecting data
- Must provide parents with control over their child's data
- Special disclosure requirements for data collection practices

**Requirements**:
- Age verification at signup
- Parental consent forms for athletes under 18
- Enhanced consent for users under 13
- State-specific compliance (California CCPA/CPRA, Illinois biometric laws)

### 2. Privacy Policy (Required)

Must clearly disclose:
- **What data we collect**: Performance measurements, photos, personal information, contact details
- **How we use it**: Performance tracking, analytics, percentile calculations, OCR processing
- **Who we share it with**: Coaches, parents, team administrators, organization admins
- **Data retention periods**: How long we keep data and when we delete it
- **User rights**: Access, correction, deletion, data portability
- **Security measures**: Encryption, access controls, breach notification
- **Cookies and tracking**: Analytics, session management
- **Third-party services**: Any external services we use
- **International transfers**: If applicable (GDPR compliance)
- **State-specific disclosures**: California, Virginia, Colorado, Connecticut, Utah

**Compliance Standards**:
- GDPR (if any EU users)
- CCPA/CPRA (California residents)
- State privacy laws (Virginia VCDPA, Colorado CPA, etc.)

### 3. Terms of Service

**Must include**:
- Liability limitations (injuries, data inaccuracy, system outages)
- Acceptable use policy (prohibited conduct, account responsibilities)
- Account termination rights (both user and platform)
- Dispute resolution process (arbitration, governing law, venue)
- Intellectual property rights (user content ownership, platform IP)
- Service modifications and updates
- Warranty disclaimers
- Indemnification provisions

### 4. Consent Forms

#### Photo/Video Release
- Permission to capture and store performance images
- OCR processing of measurement photos
- Usage rights (internal use only vs. marketing/promotional)
- Revocation procedures
- Retention timelines

#### Medical/Health Data Consent
- Performance measurements as health-related data
- HIPAA considerations if working with medical professionals
- State health privacy laws compliance
- Authorization for data sharing with coaches/trainers

#### Biometric Data Consent (State-Specific)
- Height, weight, body measurements may be considered biometric data
- **Illinois BIPA**: Requires explicit written consent + data destruction timeline
- Separate consent forms for biometric data collection
- Clear disclosure of retention and destruction schedules

### 5. Data Security Requirements

**Technical Requirements**:
- Encryption in transit (HTTPS/TLS)
- Encryption at rest (database encryption)
- Access controls and authentication
- Audit logging for sensitive data access
- Regular security assessments
- Vulnerability management

**Legal Obligations**:
- Data breach notification laws (all 50 states + GDPR)
- Incident response plan with clear timelines
- Data retention and deletion policies
- Third-party vendor security assessments
- Business continuity and disaster recovery

### 6. Educational Records (FERPA)

**If working with schools**:
- Athletic performance data may be considered educational records under FERPA
- FERPA consent required for data sharing outside the school
- School district data processing agreements needed
- Compliance with school district IT security policies
- Annual FERPA notifications to parents/students

**Requirements**:
- Written agreements with educational institutions
- Limited data access to authorized personnel only
- Prohibition on unauthorized redisclosure
- Annual security audits for school partnerships
- Parent/student right to inspect and request corrections

### 7. Organization-Specific Agreements

#### For Teams/Clubs/Schools:
- **Data Processing Agreement (DPA)**: Defines roles, responsibilities, security measures
- **Business Associate Agreement (BAA)**: If HIPAA-covered entities are involved
- **Service Level Agreement (SLA)**: Uptime, support, performance guarantees
- **Data ownership and access rights**: Clear delineation of data ownership
- **Liability and indemnification**: Risk allocation between parties
- **Termination and data return**: Procedures for ending relationship

### 8. Intellectual Property

**Content Ownership**:
- User-uploaded photos and measurements (user retains ownership)
- License grants to the platform (limited, non-exclusive for platform operation)
- Platform-generated analytics and reports (platform IP)
- Third-party content usage restrictions (if any)

**Platform IP Protection**:
- Copyright notices
- Trademark protection for brand name and logo
- Trade secret protection for algorithms and analytics methods
- Open source license compliance (if using third-party libraries)

## High-Risk Areas for AthleteMetrics

Based on the current codebase architecture:

### 1. OCR Photo Processing (`server/ocr/`)
**Risks**:
- Photos of athletes (potentially minors in athletic clothing)
- Facial recognition concerns (even if unintentional)
- Storage of sensitive biometric data

**Mitigation**:
- Photo release consent forms
- Clear data retention policy (auto-delete after OCR processing?)
- Minimal data collection (extract text, delete image)
- Access controls and audit logging
- Opt-in only, not mandatory

### 2. Multi-Tenant Organizations (Teams, Schools)
**Risks**:
- Data isolation failures (accessing other organizations' data)
- Organization admin abuse of access
- Unclear data ownership between platform and organization

**Mitigation**:
- Data isolation guarantees in DPA
- Organization admin terms and responsibilities
- Parent/guardian consent workflows managed by org admins
- Regular security audits of tenant isolation
- Incident response plan for data breaches

### 3. User Invitations (`invitations` table)
**Risks**:
- Email collection and unsolicited contact
- Invitation abuse (spam, phishing)
- CAN-SPAM Act violations

**Mitigation**:
- CAN-SPAM compliance (unsubscribe links, sender identification)
- Rate limiting on invitation sending
- Abuse detection and prevention
- Clear email communication policies
- Opt-out mechanisms

### 4. CSV Data Import (Bulk Athlete Data)
**Risks**:
- Bulk upload without individual consent
- Inaccurate or outdated data
- Unauthorized data collection

**Mitigation**:
- Data accuracy responsibilities documented
- Source verification requirements
- Consent attestation for bulk uploads (org admin certifies they have consent)
- Data validation and error reporting
- Audit trail for all imports

### 5. Analytics & Percentiles
**Risks**:
- Comparative data (potential discrimination concerns)
- Performance ranking transparency
- Psychological impact on low performers

**Mitigation**:
- Opt-out rights for comparative analytics
- Age-appropriate disclosure and consent
- Transparent methodology documentation
- Coach/parent controls over data visibility
- Anti-discrimination policies

## Recommended Implementation Order

### Phase 1: Immediate (Pre-Launch)
**Required before accepting any users**:
1. Privacy Policy (comprehensive, clear language)
2. Terms of Service (enforceable, fair terms)
3. Parental Consent Form (for minors under 18)
4. Photo/Video Release Form (for OCR feature)
5. Cookie/tracking disclosure
6. Basic consent tracking in database

**Estimated Timeline**: 2-4 weeks with legal review

### Phase 2: Before School Partnerships
**Required before working with educational institutions**:
1. FERPA compliance documentation
2. Data Processing Agreements (DPA templates)
3. School district contract templates
4. Minor protection workflows in application UI
5. Enhanced consent management system
6. Data export and deletion features (GDPR/CCPA compliance)

**Estimated Timeline**: 4-6 weeks

### Phase 3: Scaling and State-Specific Compliance
**Required before expanding to regulated states or internationally**:
1. State-specific compliance (California, Illinois, Virginia, etc.)
2. GDPR compliance (if expanding internationally)
3. SOC 2 Type II or similar security certification
4. Biometric data handling procedures (Illinois BIPA)
5. Regular third-party security audits
6. Cyber liability insurance

**Estimated Timeline**: 3-6 months

## Technical Implementation Needs

### Database Schema Additions
```sql
-- Consent tracking table
CREATE TABLE consents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  consent_type VARCHAR(50), -- 'privacy_policy', 'terms_of_service', 'photo_release', etc.
  version VARCHAR(20), -- Policy version number
  granted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Legal document versions
CREATE TABLE legal_documents (
  id UUID PRIMARY KEY,
  document_type VARCHAR(50),
  version VARCHAR(20),
  content TEXT,
  effective_date TIMESTAMP,
  created_at TIMESTAMP
);

-- Minor consent management
CREATE TABLE parental_consents (
  id UUID PRIMARY KEY,
  minor_user_id UUID REFERENCES users(id),
  parent_guardian_name VARCHAR(255),
  parent_guardian_email VARCHAR(255),
  parent_guardian_signature TEXT, -- Digital signature or typed name
  consent_granted BOOLEAN,
  granted_at TIMESTAMP,
  consent_types JSON -- Array of consent types granted
);
```

### Required Features
- [ ] Consent acceptance tracking (UI + backend)
- [ ] Privacy policy versioning (track which version user accepted)
- [ ] Parental consent workflow for minor accounts
- [ ] Age verification at signup (birthdate collection)
- [ ] Data export functionality (GDPR/CCPA right to access)
- [ ] Data deletion functionality (right to be forgotten)
- [ ] Audit logging for sensitive data access
- [ ] Consent withdrawal/revocation UI
- [ ] Email opt-out management
- [ ] Cookie consent banner (if using non-essential cookies)

### API Endpoints Needed
```
POST /api/consents/accept
GET /api/consents/history/:userId
POST /api/consents/revoke
GET /api/user/data-export
POST /api/user/delete-account
GET /api/legal/privacy-policy/:version
GET /api/legal/terms-of-service/:version
```

## Next Steps

### 1. Legal Consultation
**Find a lawyer specializing in**:
- EdTech/SportsT tech platforms
- Privacy law (COPPA, FERPA, CCPA, state privacy laws)
- Healthcare compliance (if working with medical professionals)
- Contract law (for organization agreements)

**Budget**: $5,000-$15,000 for initial legal package (policies, terms, agreement templates)

### 2. Use Legal Templates as Starting Point
**Recommended Services**:
- **Termly** ($): Privacy policy and terms generator with ongoing compliance
- **Iubenda** ($$): More comprehensive, GDPR-focused
- **Custom legal review** ($$$): Always recommended even if starting with templates

**Important**: Generic templates must be customized for your specific:
- Data collection practices
- Third-party integrations
- Business model
- Target audience (minors)
- Geographic scope

### 3. Geographic Scope Decisions

**Recommendation: Start US-Only**
- Avoid GDPR complexity initially
- State-by-state compliance (start with strictest: California, Illinois)
- Explicitly block EU traffic until ready for GDPR compliance

**State Priority Order**:
1. **California** (CCPA/CPRA): Most comprehensive state privacy law
2. **Illinois** (BIPA): Strictest biometric data requirements
3. **Virginia, Colorado, Connecticut, Utah**: Comprehensive state privacy laws
4. **All other states**: Basic privacy policy + data breach notification compliance

### 4. Insurance Coverage

**Required Policies**:
- **Cyber Liability Insurance**: Data breach response, regulatory fines, legal costs
  - Coverage: $1M-$5M depending on user base size
  - Estimated cost: $1,500-$7,500/year
- **Errors & Omissions (E&O) Insurance**: Professional liability for software errors
  - Coverage: $1M-$2M
  - Estimated cost: $1,000-$3,000/year
- **General Liability Insurance**: Bodily injury, property damage (if hosting events)
  - Coverage: $1M per occurrence
  - Estimated cost: $500-$1,500/year

### 5. Compliance Monitoring

**Ongoing Requirements**:
- Annual privacy policy review and updates
- Quarterly security assessments
- Monthly compliance checklist review
- Track regulatory changes (subscribe to privacy law updates)
- Annual legal audit (recommended)

## Resources

### Legal Information
- [FTC COPPA Compliance Guide](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [Department of Education FERPA Guidance](https://studentprivacy.ed.gov/)
- [California Attorney General CCPA Resources](https://oag.ca.gov/privacy/ccpa)
- [Illinois Biometric Information Privacy Act (BIPA)](https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004)

### Privacy Policy Generators
- [Termly](https://termly.io/)
- [Iubenda](https://www.iubenda.com/)
- [PrivacyPolicies.com](https://www.privacypolicies.com/)

### Legal Template Marketplaces
- [Docracy](https://www.docracy.com/)
- [Rocket Lawyer](https://www.rocketlawyer.com/)
- [LegalZoom](https://www.legalzoom.com/)

### Industry Associations
- [Student Privacy Pledge](https://studentprivacypledge.org/) (for EdTech)
- [Future of Privacy Forum](https://fpf.org/)
- [International Association of Privacy Professionals (IAPP)](https://iapp.org/)

## Questions to Answer with Legal Counsel

1. **Age Verification**: What constitutes "reasonable" age verification under COPPA?
2. **Parental Consent**: Can we use electronic consent, or do we need wet signatures?
3. **Data Ownership**: Who owns performance data—the athlete, parent, organization, or platform?
4. **Biometric Data**: Are height/weight/measurements considered biometric data in our target states?
5. **FERPA Scope**: Does our platform qualify as a "school official" under FERPA when used by schools?
6. **Liability Limits**: What liability limitations are enforceable in our terms of service?
7. **International Expansion**: What triggers GDPR compliance (EU users, EU data storage, EU marketing)?
8. **Data Retention**: What are appropriate retention periods for different data types?
9. **Marketing Use**: Can we use performance data/photos for marketing with consent?
10. **Subprocessors**: What obligations do we have when using third-party services (hosting, email, analytics)?

## Document Maintenance

- **Owner**: Legal/Compliance Team (initially: Founder/CEO)
- **Review Frequency**: Quarterly, or upon regulatory changes
- **Last Updated**: 2025-01-16
- **Next Review**: 2025-04-16

---

**Disclaimer**: This document is for informational purposes only and does not constitute legal advice. Consult with qualified legal counsel before making compliance decisions.
