# Publishing v1.1.1

## 0. Temporary Firefox check (do this first)

Try the new build as a temporary add-on before you upload anything.

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Disable your installed copy first**: open `about:addons` and turn off your installed copy (it still shows the old name "Block Site — Impulse Guard"). Two copies with the same ID will clash.
3. Back in `about:debugging`, click **Load Temporary Add-on…** and select `src/manifest.json`.
4. To test quickly, open the extension's Settings and set **Breathing timer** to 5 seconds.

Checklist:

- [ ] **Timed site**: give a reason → timer → type `1` in "Other" → Go. The site opens. After about 1 minute, every tab on that site goes back to the block page with a "Time's up" notice.
- [ ] **YouTube**: give a reason → timer → type a title, pick minutes. You land on the search results for that title, and clicking a video works until the time is up.
- [ ] **YouTube without a title**: clicking a minutes button shows "Type what you're going to watch first."
- [ ] **Strict site**: give a reason → you see the dead-end message and no timer. In Settings it shows "Strict (locked)" with no Unblock button.
- [ ] **Timer pauses** when you switch to another tab and resumes when you come back.
- [ ] **Popup on a site with an active pass** shows the countdown, and "I'm done, block it now" re-blocks the site right away.
- [ ] **Popup on an unblocked site** shows Timed / Strict (needs a second click to confirm). On youtube.com it also shows YouTube search.
- [ ] **Settings**: the − / + buttons change the timer in steps of 5, and Max time per visit caps the minutes buttons.
- [ ] **Report page** shows each attempt's reason, any YouTube search, and "went in for N min" or "stayed out".
- [ ] **No errors**: in `about:debugging`, click **Inspect** on the extension and check the console.

Note: temporary add-ons get a fresh, empty storage, so this test **won't** show how your old blocked list migrates. The code handles that: old YouTube entries become YouTube search and all other sites become Timed. You'll see it for real after the update installs. Remove the temporary add-on and turn your installed copy back on when you're done.

---

## 1. Decide before uploading

- **Version number**: `src/manifest.json` is now `1.1.1`. It must be higher than anything you've uploaded before. If you ever uploaded a 1.1.x, bump it.
- **Add-on ID**: keep `block-site-impulse-guard@local.extension` exactly as it is, even though the name is now "Block Urge". Users never see the ID. A different ID makes AMO treat it as a brand-new add-on, and your installed copy won't update.
- **Name**: now **Block Urge** (it was "Block Site — Impulse Guard"). The AMO listing name updates from the uploaded manifest. You can also edit it on the listing page.
- **Minimum Firefox version**: already set to `140.0`, because `data_collection_permissions` only exists from Firefox 140. That avoids a validator warning. Current Firefox and ESR are both 140 or newer.

## 2. Build the upload zip

From the project folder (`blocksite/`):

```bash
sh no_zip/build.sh
```

Upload `no_zip/dist/block-urge-firefox-1.1.1.zip`. The script zips only what's inside `src/`, with `manifest.json` at the root of the zip.

No source-code upload is needed: the code isn't minified or bundled, so answer **No** to the source-code question.

## 3. Upload it as a new version of your existing add-on

Go through your existing add-on, not "Submit a New Add-on". A new submission creates a second add-on and fails because the ID is already taken.

1. Sign in at https://addons.mozilla.org/developers/ → **Manage My Submissions**, then open your add-on. It shows the old name "Block Site — Impulse Guard" until this version goes through.
2. Click **Upload New Version**.
3. When it asks how to distribute, choose **On this site** (listed). Your old version was "On your own" (unlisted).
4. Upload the zip and fix any validator **errors**. Warnings are fine, but read them.
5. Because this is the add-on's first listed version, AMO asks for listing details (step 4 below).

If the "On this site" option doesn't appear for your add-on, ask on https://discourse.mozilla.org/c/add-ons/35. Older forum posts say an add-on can switch from unlisted to listed, but some old ones say it had to be resubmitted.

## 4. Listing details (ready to paste)

**Summary** (shown in search results; 250 characters max):

> Blocks distracting sites. Say why you're there, wait out a breathing timer, then pick how many minutes you get. When time's up, it's blocked again. Strict mode for sites with no way through.

**Description**:

> Block Urge puts a pause between you and the sites you open on autopilot.
>
> When you open a blocked site, you get a block page instead. You write down why you're there, wait out a breathing timer, and only then choose how many minutes you get. When the time runs out, every tab on that site goes back to the block page.
>
> Three modes per site:
> • Timed: reason → timer → pick minutes → access, then blocked again.
> • YouTube search: reason → timer → pick minutes and type what you'll watch. YouTube opens straight on the search results, not the home feed or recommendations.
> • Strict: no way through. Strict sites are locked and can't be removed or loosened later.
>
> Also:
> • Adjustable breathing timer (5 to 600 seconds) and a cap on minutes per visit
> • The timer pauses if you switch tabs
> • Block the current site in one click from the toolbar, which also shows the time left on an active pass
> • A report page with attempts today, a 7-day trend, and the reasons you gave
>
> Privacy: everything stays in your browser's local extension storage. No accounts, no servers, no analytics, nothing is sent anywhere.

**Categories**: Privacy & Security is the closest fit. AMO has no "Productivity" category for Firefox, so use "Other" as the second if you want one.

**License**: pick one, for example MIT. Mozilla Public License 2.0 is the AMO default.

**Privacy policy**: not strictly required, since no data leaves the device. A short one still helps reviewers and users:

> Block Urge does not collect, transmit, or share any data. Your blocked sites, settings, and attempt history (times, reasons you type, YouTube searches) are stored only in your browser's local extension storage and are deleted when you uninstall the extension.

**Support email / website**: optional, but a GitHub repo or an email address helps users report bugs.

**Screenshots** (strongly recommended; take them at 1280×800):
1. The block page with the reason box
2. The breathing timer
3. The "how many minutes" step (the YouTube version shows the title field)
4. The Settings page
5. The report page

**Notes to reviewer** (only reviewers see this):

> `<all_urls>` + `webNavigation`: needed to detect navigation to any site the user has chosen to block and redirect it to the extension's block page. `alarms`: to end a timed pass and re-block the site when the user's chosen minutes run out. `storage`: local settings and history only. No remote code, no network requests, no data collection. To test: open Settings, add reddit.com (Timed), visit it, enter a reason, wait out the timer, and choose 1 minute.

## 5. After submitting

- Listed versions go through automated validation and may also get a human review, before or after they go live. This usually takes minutes to a day or two, sometimes longer. You'll get an email.
- **Your installed copy**: once the listed version is approved, Firefox should update it automatically, because the ID is the same and there's no custom `update_url`. You can check under `about:addons` → gear icon → **Check for Updates**. If it doesn't update, install it once from the new public listing page. Your data is kept as long as you don't uninstall first.
- After the update, open Settings and check that your old sites show the right modes. Change any site that should be **Strict**: old non-override sites were dead ends, and they now default to **Timed**.

## 6. Future updates

For each future release: bump `"version"` in `src/manifest.json`, run `sh no_zip/build.sh`, then go to the add-on page → **Upload New Version** → **On this site**.

---

Sources:
- [Submitting an add-on (Extension Workshop)](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Creating an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)
- [Firefox built-in data consent (`data_collection_permissions`, Firefox 140+)](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Mixing listed and unlisted versions on AMO (Mozilla blog)](https://blog.mozilla.org/addons/2017/01/26/mixing-listed-and-unlisted-on-amo/)
- [Forum: changing an add-on from unlisted to listed](https://discourse.mozilla.org/t/is-any-way-to-change-the-addon-from-unlisted-to-listed-without-losing-of-current-users/19609)
