<!-- page 1 -->

R12. How can websites keep track of users? Do they always need to use cookies?

HTTP 是無狀態的，網站需要明確地做一些事情來 track user。（ 一種方是是使用 cookie。（ cookie 允許網站在不同會話中跟蹤使用者（即瀏覽器關閉和重啟時）。如果在單一會話中追蹤使用者就足夠了，則網站可以在伺服器端生成唯一 ID 並製作網頁，以便將此類 ID 附加到所有後續請求中。（

R13. Describe how Web caching can reduce the delay in receiving a requested object. Will Web caching reduce the delay for all objects requested by a user or for only some of the objects? Why?

> note: 把想要

1. Web caching 可讓所需內容更接近用戶，可能與用戶主機所連接的 LAN 相同。

> note: 甚至是沒有快取的object
2. all objects, even objects that are not cached，因為快取可以減少連結上的流量。

R14. Telnet into a Web server and send a multiline request message. Include in the request message the If- modified-since: header line to force a response message with the 304 Not Modified status code.

> note: 如果要使用telnet

> note: 控制台->程式集

預設情況下，Telnet 在 Windows 7 中不可用。若要使其可用，請前往「控制台」、「程式和功能」、「開啟或關閉 Windows 功能」、檢查 Telnet 用戶端。若要啟動 Telnet，（ 請在 Windows 命令提示字元中發出以下 command

> note: 在cmd輸入指令就可使用

\> telnet webserver 80

其中「webserver」是某個網頁伺服器。發出命令後，您就在客戶端 telnet 程式和 Web server 之間建立了 TCP 連線。然後輸入 HTTP GET 訊息。

R15. Are there any constraints on the format of the HTTP body? What about the email message body sent with SMTP? How can arbitrary data be transmitted over SMTP?

1\. HTTP body 沒有格式限制：它僅由原始格式的實際文件組成。因此，HTTP body 還可以包含二進位數據，例如圖像。

> note: 字符

2. SMTP 要求電子郵件訊息的正文由 7-bit ASCII characters 表示。

> note: 變成

> note: 將資料解碼恢復原本內容
3. 任意資料需要先編碼為 7 -bit ASCII characters 才能添加到 email 正文中。收到訊息後，需要對此類資料進行解碼以恢復原始內容。Base64 是一種方案將資料 encode 為 7-bitASCII characters。

R16. Suppose Alice, with a Web-based e-mail account (such as Hotmail or Gmail), sends a message to Bob, who accesses his mail from his mail server using IMAP. Discuss how the message gets from Alice’s host to Bob’s host. Be sure to list the series of application-layer protocols that are used to move the message between the two hosts.

1. 訊息透過 HTTP 從 Alice 的主機傳送到她的 email server。
2. Alice 的 email server 透過 SMTP 將訊息傳送到 Bob 的 email server。
3. Bob 透過 POP3 將訊息從會的 mail server 傳送到會的主機。


