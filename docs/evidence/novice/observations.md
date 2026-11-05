# First-use observation log

These are simulated personas operated by the tester, not interviews with recruited students. The initial sessions used only renderer screenshots, accessibility snapshots, and in-app help. Source inspection started after all three initial sessions. The tester read only launch metadata and the existing loopback fixture's server setup before those sessions.

## Persona 1

A 19-year-old university student uses Traditional Chinese on a MacBook. They have only used Moodle through their school site and have never used an AI app.

1. I expect a starting point, not an account form. The six-step guide explains reading and school work. It explicitly says it has not connected anything. I can choose 繁體中文, 海洋, and 深色. Evidence is `p1-before-01-welcome.txt` through `p1-before-07-guide-final.txt`.
2. I choose school work. The school picker explains its steps and lists four schools. Searching an imaginary school gives an empty result with an address alternative. I understand how to correct the search. Evidence is `p1-before-08-school-search.png` and `p1-before-09-wrong-school.png`.
3. The supplied loopback address cannot connect. HTTP produces an explicit encryption warning. HTTPS produces an unsupported-public-site message. I have no reason to bypass that warning. School connection, school deadlines, and teacher content cannot succeed in this baseline. Evidence is `p1-before-10-loopback-input.txt` and `p1-before-11-private-school-rejected.png`.
4. I expect a way to plan even without a school. Today / Study plan lets me add a personal task, propose a week, and approve it. I see the saved status and a 30-minute block. The first draft took 5.963 seconds including tester pauses. Evidence is `p1-before-14-planner.png` through `p1-before-16-plan-approved.png`.
5. I look for old chat through 聊天紀錄. It explains where conversations will appear. There are no conversations to retrieve because no AI answer has succeeded. Evidence is `p1-before-17-history-empty.png`.
6. I import a small text-layer PDF. The renderer says 正在準備讀取文字. I cannot type a question. The model menu says 找不到模型. I do not know how to make a model appear. Evidence is `p1-before-19-pdf-import.png` through `p1-before-22-model-empty.png`.
7. I find settings through its gear. 供應商 is unfamiliar. I see API keys, a base URL, executable paths, and command-line tools. I have none of those accounts or tools. There is no clear teacher or IT route. Evidence is `p1-before-23-settings-ai.png`.

## Persona 2

An international student reads English and has used ChatGPT.

1. I leave the guide to explore. Home has a file action, a sample, and a getting-started checklist. Courses is discoverable in the sidebar. Evidence is `p2-before-03-home.png` and `p2-before-04-school-search.png`.
2. I try the loopback school address and receive the same public-HTTPS restriction. The failed connection blocks school deadlines and teacher content. Evidence is `p2-before-05-loopback-rejected.png`.
3. I add a biology task and ask the planner for a week. The draft and Approve and save make the consequence clear. The draft-to-approval sequence took 11.964 seconds including tester pauses. Evidence is `p2-before-07-planner-task.png` through `p2-before-09-plan-approved.png`.
4. I find Settings, Appearance, Grove, and Dark. I can select English explicitly. This sequence took 7.536 seconds including pauses. Evidence is `p2-before-10-settings.png` through `p2-before-12-providers.png`.
5. I expect my ChatGPT experience to help me ask about a PDF. The input is disabled and the menu has no models. Providers settings explains that an API key is different from a chat login, but does not give me a complete next step or school fallback. Evidence is `p2-before-12-providers.png` and `p2-before-13-pdf-import.png`.
6. History search is easy to find, but there is no saved conversation to recover. Evidence is `p2-before-14-history-search.png`.

## Persona 3

A student reads English, does not connect a school, and wants to read a PDF with AI help.

1. I choose a PDF immediately. It enters the library and opens, but the renderer stays on Preparing text reader. The chat box is disabled. Evidence is `p3-before-01-pdf-first.png`.
2. Converting / Failed tells me the file is converting. Settings > Storage shows usage but does not answer the immediate reading question. I can choose Paper, Light, and English. Evidence is `p3-before-02-import-status.png` and `p3-before-03-storage.png`.
3. I try the sample as a fallback. It initially also waits. Evidence is `p3-before-05-sample-open.png`.
4. I try the planner while waiting. A personal PDF-review task can be planned and approved without a school. History has no matching conversation. Evidence is `p3-before-06-no-school.png` through `p3-before-08-history-search.png`.
5. The tester checks the native window and finds a pending download-consent sheet. Earlier renderer captures omitted that sheet. This corrects the apparent frozen-import diagnosis. Those earlier waits are not valid conversion-performance measurements. Evidence is `p3-before-native-consent.jpg`.
6. I choose Offline mode instead of permitting the download. The PDF becomes failed. The sample becomes readable, and I can select a paragraph. I still cannot ask a question or understand how to enable the missing AI. Evidence is `p3-before-10-offline-documents.png` through `p3-before-12-selected-no-answer.png`.

## Source-informed rechecks

The `*-recheck-*` captures come from the committed regression script. They are not additional naive sessions. All three start with a fresh profile, no saved AI key, and command-line AI disabled. They verify reading, the school-support fallback, returning to reading, real PDF conversion with an installed reading environment, and persisted PDF navigation after restart. The answer phase explicitly switches to the local fake adapter. It verifies selection propagation and history retrieval, not real AI quality.

The manual Traditional Chinese PDF recheck accepted the real native download sheet. The document became readable and selectable within 40.357 seconds of import, including time spent inspecting and operating the native sheet. Evidence is `p1-after-native-consent.jpg` and `p1-after-06-pdf-selected-no-key.png`.

The school rechecks use the existing first-time-user main-process fixture with `student` / `example-only`. The existing loopback Moodle webview test separately verifies the authenticated HttpOnly cookie, teacher page, account isolation, certificate failure, and expired-session recovery. Neither test proves a live university login.
