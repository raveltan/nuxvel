import { named } from "../../../src/runtime/server/discovery/definition-name";
import deliverMail from "../../../src/runtime/server/mail/jobs/deliver-mail";

export default [named(deliverMail, "nuxvel.mail", "mail/jobs/deliver-mail.ts")];
