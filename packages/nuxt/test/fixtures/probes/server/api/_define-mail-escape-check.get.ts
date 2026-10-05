import { welcomeMail } from "~~/server/mail/welcome.mail";

export default defineEventHandler(() =>
  welcomeMail.render({
    to: "ada@example.com",
    name: '<a href="https://evil.example">x</a> <img src="https://evil.example/p.png"> x" class="a &lt;b&gt;',
  }),
);
