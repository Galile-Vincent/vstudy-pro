# Sign direct-download releases

Use this guide to give the release engineer credentials for macOS and Windows. Follow [the release procedure](../CONTRIBUTING.md#release-checklist) before publishing. Signing setup does not authorize a release.

A `ci/**` branch push and manual workflow dispatch with `dry_run: true` are unsigned dry runs. They receive no signing secrets, publish no release, and upload no files to Releases. Only an owner-approved version tag can publish, either through its push or through a dispatch against that exact tag with `dry_run: false`.

For trusted jobs permitted to sign, the distribution contract supports unsigned builds when no credentials exist. A complete credential set enables signing in the same build targets. Partial credentials or failed signing must fail the build. Never label an artifact signed merely because secrets exist. Verify the downloaded artifact.

## Hand this checklist to the release engineer

- [ ] Name the legal publisher and the people authorized to release. Enable account MFA and keep recovery access with the owner.
- [ ] For Mac, provide a password-protected Developer ID Application P12 and either a team App Store Connect API key or Apple account notarization credentials.
- [ ] For Windows, choose one signing route below. Provide its complete credential set and the expected certificate subject. For Azure, set the nonsecret Actions variable `WIN_PUBLISHER_NAME` to the exact certificate CN.
- [ ] Confirm Azure eligibility before buying a subscription. Taiwan is not on the current Public Trust eligibility list.
- [ ] Add secrets through GitHub Settings or `gh secret set`. Share secret names, expiration dates, and account owners with the engineer, never secret values in chat or tickets.
- [ ] Confirm the workflow reads the exact names below, materializes the Apple key safely, and only exposes platform-specific credentials to trusted packaging jobs.
- [ ] Run the unsigned branch-only dry run first. For owner-authorized signing verification before publication, run `node scripts/package-release.mjs --target <native-target>` from `apps/desktop` on a trusted matching native host with signing credentials. The helper uses `publish: never`. The workflow's dry-run mode cannot access signing secrets. Retain installers, checksums, signing results, and packaged smoke reports for both platforms.
- [ ] Verify actual downloaded files on clean machines. Record Team ID, publisher subject, certificate expiry, notarization result, workflow URL, and commit.
- [ ] Obtain owner approval before the non-draft tag release. Keep manual updates until the separate updater review is complete.

## Choose the Windows route

Prices below are approximate planning figures checked on **2026-11-06**, before taxes and regional changes. Recheck the linked vendor pages before purchase.

| Route | Cost example | Requirements and fit |
| --- | --- | --- |
| Azure Artifact Signing, formerly Trusted Signing | Basic about US$9.99 per month with 5,000 signatures. Premium about US$99.99 with 100,000. Overage US$0.005 per signature. | Paid Azure subscription, eligible verified identity, Public Trust profile, an Entra signing identity, and nonsecret `vars.WIN_PUBLISHER_NAME` matching the certificate CN exactly. Cloud HSM keys remain with Microsoft. [Microsoft SKU details](https://learn.microsoft.com/azure/artifact-signing/how-to-change-sku). |
| CA-issued OV | SSL.com lists a one-year certificate at US$129. | Organization validation. Key custody costs extra. The same page lists a US$379 token option or separately priced cloud signing. This is a vendor example, not a market-wide price. [SSL.com OV](https://www.ssl.com/products/software-integrity/code-signing/ov/). |
| CA-issued EV | SSL.com lists one year at US$349, with key storage charged separately. | Additional identity checks. EV does not buy an immediate SmartScreen bypass. Choose a CA and supported HSM provider based on identity eligibility and unattended CI access. [SSL.com EV](https://www.ssl.com/products/software-integrity/code-signing/ev/). |
| SignPath Foundation | Free for accepted open-source projects. | Application and approval required. The Foundation supplies the signing identity and HSM service. It does not mean every public repository qualifies. [Foundation offer](https://signpath.org/), [conditions](https://signpath.org/terms.html). |

A valid signature identifies a publisher and detects modifications. New signed files can still trigger SmartScreen. EV no longer receives automatic reputation. Do not promise a warning-free Windows install. See [Microsoft's SmartScreen guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).

## Set up macOS signing

### Enroll and export the signing certificate

1. Enroll the publisher in the Apple Developer Program. Use an Apple Account with two-factor authentication. The annual fee is US$99 or local currency. Organizations need a legal entity and the enrollment information Apple requests. See [Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment).
2. Have the Account Holder create a **Developer ID Application** certificate in Certificates, Identifiers & Profiles. Create the certificate signing request using Keychain Access on the Mac that keeps the private key. Upload the CSR, download the issued certificate, and install it on that Mac. See [Apple's Developer ID procedure](https://developer.apple.com/help/account/certificates/create-developer-id-certificates).
3. In Keychain Access, open **My Certificates**. Expand the Developer ID Application identity and confirm it has a private key. Export the identity and private key as a password-protected `.p12`. Store the P12 and password in separate protected locations. A `.cer` alone cannot sign.
4. Record the certificate's Team ID, legal publisher, expiry, and owner. DMG and ZIP distribution uses Developer ID Application. Developer ID Installer is for PKG, which this release does not use. See [electron-builder's certificate guide](https://www.electron.build/v26/docs/features/code-signing/code-signing-mac/).

Set `CSC_LINK` to the base64 encoding of the complete P12. Set `CSC_KEY_PASSWORD` to its export password. On a local build, `CSC_LINK` can instead be an absolute P12 path. `CSC_NAME` can select an already installed identity locally, but is not the portable CI credential contract. See [electron-builder signing variables](https://www.electron.build/v26/docs/features/code-signing/).

### Create notarization credentials

Prefer a dedicated **team** App Store Connect API key. The Account Holder requests API access if needed. An Account Holder or Admin opens **Users and Access > Integrations > App Store Connect API > Team Keys** and generates a key. See [Apple's API key instructions](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).

Use **App Manager** access as documented by [Electron's notarization library](https://github.com/electron/notarize#usage-with-app-store-connect-api-key). Download `AuthKey_<KEY_ID>.p8` once, then store it securely. Record the Key ID and Issuer ID. This setup uses a team key with an issuer, not the individual-key flow.

| Name | Repository secret value | Build process value |
| --- | --- | --- |
| `CSC_LINK` | Base64 P12 | Same base64 P12 or a private temporary P12 path |
| `CSC_KEY_PASSWORD` | P12 export password | Password |
| `APPLE_API_KEY` | Raw contents of the `.p8` file | Absolute path to a temporary `.p8` file |
| `APPLE_API_KEY_ID` | App Store Connect Key ID | Key ID |
| `APPLE_API_ISSUER` | Team key Issuer ID | Issuer ID |

The engineer must write the repository `APPLE_API_KEY` secret to a mode-0600 file under the runner's temporary directory and set the process variable to that file's path. Delete the file after the job. A path on your laptop is not usable on a hosted runner. Base64 is unnecessary for the P8 secret. Do not pass raw P8 text to a tool that expects a filename.

The alternative is `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Generate the app-specific password in the Apple Account's sign-in security settings. Use that password, never the account's normal password. Choose one complete notarization method and remove stale values from the other. See [Electron's app-specific-password setup](https://github.com/electron/notarize#usage-with-app-specific-password).

### Add the Mac secrets

Run from a trusted terminal with `gh` authenticated to the correct repository. These commands send files through stdin or prompt for input. They do not put secret literals in shell history. Substitute your private file paths.

```sh
set +x
base64 -i '/private/path/DeveloperIDApplication.p12' | tr -d '\r\n' | gh secret set CSC_LINK --repo ava-apple/vstudy-pro
gh secret set CSC_KEY_PASSWORD --repo ava-apple/vstudy-pro
gh secret set APPLE_API_KEY --repo ava-apple/vstudy-pro < '/private/path/AuthKey_KEYID.p8'
gh secret set APPLE_API_KEY_ID --repo ava-apple/vstudy-pro
gh secret set APPLE_API_ISSUER --repo ava-apple/vstudy-pro
```

For the Apple Account alternative, omit the three API secrets and use the prompts below.

```sh
gh secret set APPLE_ID --repo ava-apple/vstudy-pro
gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo ava-apple/vstudy-pro
gh secret set APPLE_TEAM_ID --repo ava-apple/vstudy-pro
```

## Set up Windows signing

### Configure Azure Artifact Signing

1. Check current geographic eligibility in [the Microsoft quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart). Public Trust currently permits individual developers in the US or Canada. Eligible organizations have a wider country list that excludes Taiwan. A Private Trust profile is not a substitute for public installer trust.
2. Create or select a paid Azure subscription and resource group. Register `Microsoft.CodeSigning`. Create an Artifact Signing account in a supported region. Record the account's regional **Signing endpoint URI**, account name, subscription, and resource group.
3. Assign **Artifact Signing Identity Verifier** to the human who performs identity validation. Submit the Public identity request in the Azure portal with matching legal name, address, domain, and identity documents. Complete the verification prompts. Wait for **Completed** before continuing.
4. Create a **Public Trust** certificate profile using that verified identity. Record its exact profile name and subject. Public Trust Test and Private Trust profiles do not establish ordinary public trust. Resource creation and validation are described in [the quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).
5. In Microsoft Entra ID, create an app registration for release signing. Record **Directory (tenant) ID** and **Application (client) ID**. Create a client secret under **Certificates & secrets**. Store its **Value**, not its secret ID, and record expiry.
6. Assign the service principal **Artifact Signing Certificate Profile Signer** on the intended profile scope. Owner or Contributor alone does not grant signing. Keep identity verification separate from the signing identity. See [resources and roles](https://learn.microsoft.com/azure/artifact-signing/concept-resources-roles) and [signing integrations](https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-signing-integrations).
7. Give the engineer the following six repository secrets and the nonsecret Actions variable `WIN_PUBLISHER_NAME`. For electron-builder v26 Azure signing, the publisher name must match the certificate CN exactly. The packaging adapter maps the endpoint, account, profile, and publisher into `win.azureSignOptions`. See [electron-builder Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).

| Repository setting | Exact value |
| --- | --- |
| `AZURE_TENANT_ID` | Entra Directory tenant UUID |
| `AZURE_CLIENT_ID` | App registration Application client UUID |
| `AZURE_CLIENT_SECRET` | Client secret Value |
| `AZURE_ENDPOINT` | Regional signing service HTTPS endpoint, not an Azure portal URL |
| `AZURE_CODE_SIGNING_ACCOUNT` | Signing account resource name |
| `AZURE_CERTIFICATE_PROFILE` | Public Trust certificate profile name |
| `WIN_PUBLISHER_NAME` (Actions variable) | Exact certificate Common Name (CN), not the account or profile name |

Use prompts for the secrets. Set `WIN_PUBLISHER_NAME` under Actions variables, not secrets. Replace the placeholder below with the certificate's exact CN. Record the endpoint and names in the protected handoff too, since these are configuration rather than passwords.

```sh
gh secret set AZURE_TENANT_ID --repo ava-apple/vstudy-pro
gh secret set AZURE_CLIENT_ID --repo ava-apple/vstudy-pro
gh secret set AZURE_CLIENT_SECRET --repo ava-apple/vstudy-pro
gh secret set AZURE_ENDPOINT --repo ava-apple/vstudy-pro
gh secret set AZURE_CODE_SIGNING_ACCOUNT --repo ava-apple/vstudy-pro
gh secret set AZURE_CERTIFICATE_PROFILE --repo ava-apple/vstudy-pro
gh variable set WIN_PUBLISHER_NAME --repo ava-apple/vstudy-pro --body 'EXACT CERTIFICATE CN'
```

A future OIDC migration can remove the client secret once the workflow explicitly supports federated credentials. Adding an OIDC trust alone does not change the current adapter's credential contract.

### Use a CA certificate or cloud HSM

Ask the CA to validate the legal publisher before issuance. Confirm the key custody and CI integration before payment. Modern public code-signing issuance commonly requires hardware-backed keys. A token or HSM key is usually non-exportable. Buying OV or EV does not imply that a downloadable PFX private key exists. See the key storage choices on [SSL.com's OV page](https://www.ssl.com/products/software-integrity/code-signing/ov/).

If you legitimately have a supported PFX containing an exportable private key, provide base64 `WIN_CSC_LINK` and its `WIN_CSC_KEY_PASSWORD`. Keep Mac certificates out of Windows jobs. For example, from a trusted Mac terminal:

```sh
set +x
base64 -i '/private/path/windows-signing.pfx' | tr -d '\r\n' | gh secret set WIN_CSC_LINK --repo ava-apple/vstudy-pro
gh secret set WIN_CSC_KEY_PASSWORD --repo ava-apple/vstudy-pro
```

For a token, cloud HSM, or CA service, have the engineer implement and review a compatible electron-builder signing hook. Set `WIN_SIGNTOOL_HOOK` to its repository-relative script path. The path is configuration, not certificate material. This variable selects a hook; it does not supply a signing service by itself. If the provider needs credentials, put its named fields in the optional `WIN_SIGNTOOL_CREDENTIALS` JSON-object secret. The workflow passes that object through the environment only to trusted Windows release packaging, so adding provider credentials needs no workflow rewrite. The reviewed hook must validate its provider's required fields, sign every requested executable including installer and uninstaller, timestamp with SHA-256, propagate failure, and keep all credential fields out of argv and logs. A USB token on a laptop needs a connected signing runner; GitHub-hosted runners cannot access it directly.

```sh
gh secret set WIN_SIGNTOOL_HOOK --repo ava-apple/vstudy-pro
gh secret set WIN_SIGNTOOL_CREDENTIALS --repo ava-apple/vstudy-pro
```

Configure only one Windows route. Remove the unused Azure, PFX, or hook selectors before switching. Conflicting or partial routes must fail rather than silently select unsigned output.

### Apply to SignPath Foundation

First choose and add an OSI-approved project license with the owner's approval. This repository currently has no project license, so a public GitHub URL alone does not establish eligibility. Check the Foundation's conditions for proprietary components, existing releases, documentation, source ownership, and review requirements. Submit the project through [SignPath Foundation](https://signpath.org/).

If accepted, agree on project, artifact configuration, signing policy, authorized maintainers, and GitHub build provenance with SignPath. Implement their approved build integration separately. The Azure and PFX secrets above do not activate SignPath. Do not add an invented SignPath token or promise approval. See [Foundation conditions](https://signpath.org/terms.html).

## Verify the delivered artifacts

An owner-authorized signing verification run must retain the exact signed artifacts. The initial branch-only dry run remains unsigned. Download them rather than verifying a different local build. Compare SHA-256 against that run's checksums. For public releases, also download the stable asset aliases and compare their bytes with the versioned assets.

On Mac, mount the DMG and copy the app to a disposable verification location. These commands inspect the installed copy and delivered DMG. Adjust paths for the architecture.

```sh
codesign --verify --deep --strict --verbose=2 '/Applications/VStudy Pro.app'
codesign --display --verbose=4 '/Applications/VStudy Pro.app'
spctl --assess --type execute --verbose=4 '/Applications/VStudy Pro.app'
xcrun stapler validate '/Applications/VStudy Pro.app'
xcrun stapler validate "$HOME/Downloads/VStudy-Pro-mac-arm64.dmg"
```

Require the expected Developer ID authority and TeamIdentifier, a secure timestamp, a valid stapled notarization ticket, and an accepted Gatekeeper assessment. Ad-hoc signing is not Developer ID. If a ticket is missing, staple in the packaging job, regenerate checksums, and repeat verification. Do not repair a downloaded release locally and call the published file verified. Test first-open on a clean quarantined download too. See [Apple's notarization guide](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [Gatekeeper behavior](https://support.apple.com/en-us/102445).

On Windows, use a Developer PowerShell with the Windows SDK's SignTool on PATH. Inspect both the installer and the installed executable.

```powershell
signtool verify /pa /all /v .\VStudy-Pro-win-x64.exe
$signature = Get-AuthenticodeSignature -LiteralPath .\VStudy-Pro-win-x64.exe
$signature | Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
if ($signature.Status -ne 'Valid') { throw 'Installer signature is not valid' }
Get-FileHash -Algorithm SHA256 -LiteralPath .\VStudy-Pro-win-x64.exe
```

Require `Valid`, the intended publisher, a trusted chain, and a timestamp. Verify ARM64 separately. A ZIP itself has no Authenticode signature; verify its extracted EXE and any signed native payloads. Run the per-user install, launch, upgrade, and uninstall on clean Windows. Record SmartScreen behavior separately from signature validity. See [SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool) and [Get-AuthenticodeSignature](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature).

## Protect and rotate credentials

Use repository secrets or an explicitly wired protected GitHub Environment. An environment secret is invisible to a job that does not select that environment. Restrict signing to reviewed code and owner-approved releases. Never expose signing credentials to fork pull requests or unreviewed workflow changes. See [GitHub's Actions secret guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

Do not use `echo`, `printenv`, `set -x`, shell tracing, debug environment dumps, or CI artifacts to inspect secret values. GitHub masking is a fallback, not a guarantee for transformed values. Store temporary keys outside the checkout, limit permissions, delete them after use, and keep encrypted recovery copies outside CI.

Track P12 expiry, API key owner, Azure client secret expiry, profile validity, HSM access, and authorized release approvers. Rotate by creating replacement credentials, updating the secrets, running a nonpublishing signed build on a trusted native host as described in the checklist, and verifying its retained artifacts. Then revoke the old API key or client secret and remove old runner files. On suspected compromise, stop releases and revoke affected access immediately. Coordinate certificate revocation and publisher changes with the owner because existing installs and future updater trust may depend on them.

## Keep updates manual until signing is proven

Release metadata can be emitted before an updater is active. Do not enable `electron-updater` until signed Windows artifacts and signed, notarized Mac artifacts pass verification. The later change needs feed validation, publisher continuity, consent and restart controls, staged rollout, and a rollback policy compatible with database migrations. Signing secrets alone do not enable automatic updates.
