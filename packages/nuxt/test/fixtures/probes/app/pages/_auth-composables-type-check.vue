<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;
type Typed<T, Expected> = IsAny<T> extends true ? never : T extends Expected ? true : never;

const { list, revoke, revokeOthers } = useSessions();
const changeEmail = useChangeEmail();
const { enable, verify, disable, backupCodes } = useTwoFactor();
const resend = useResendVerification("ada@example.com");
const updated = unwrapAuth({ data: { status: true }, error: null }, "Could not save");

const sessionsAreTyped: Typed<NonNullable<typeof list.data>[number]["token"], string> = true;
const revokeIsTyped: Typed<typeof revoke.data, { status: boolean } | undefined> = true;
const revokeErrorIsTyped: Typed<typeof revoke.error, Error | null> = true;
const revokeOthersIsTyped: Typed<typeof revokeOthers.data, { status: boolean } | undefined> = true;
const revokeOthersErrorIsTyped: Typed<typeof revokeOthers.error, Error | null> = true;
const changeEmailIsTyped: Typed<typeof changeEmail.data, { status: boolean } | undefined> = true;
const changeEmailErrorIsTyped: Typed<typeof changeEmail.error, Error | null> = true;
const requestedIsTyped: Typed<typeof changeEmail.requested, boolean> = true;
const totpUriIsTyped: Typed<NonNullable<typeof enable.data>["totpURI"], string> = true;
const enableErrorIsTyped: Typed<typeof enable.error, Error | null> = true;
const verifyIsTyped: IsAny<typeof verify.data> extends true ? never : true = true;
const verifyErrorIsTyped: Typed<typeof verify.error, Error | null> = true;
const disableIsTyped: Typed<typeof disable.data, { status: boolean } | undefined> = true;
const disableErrorIsTyped: Typed<typeof disable.error, Error | null> = true;
const backupCodesAreTyped: Typed<typeof backupCodes.value, string[]> = true;
const resendIsTyped: Typed<typeof resend.data, { status: boolean } | undefined> = true;
const resendErrorIsTyped: Typed<typeof resend.error, Error | null> = true;
const unwrapIsTyped: Typed<typeof updated, { status: boolean }> = true;
const sessionsListIsNotAny: IsAny<ReturnType<typeof useSessions>["list"]> extends true ? never : true = true;
const twoFactorEnableIsNotAny: IsAny<ReturnType<typeof useTwoFactor>["enable"]> extends true ? never : true = true;
const changeEmailIsNotAny: IsAny<ReturnType<typeof useChangeEmail>> extends true ? never : true = true;
const resendVerificationIsNotAny: IsAny<ReturnType<typeof useResendVerification>> extends true ? never : true = true;

// @ts-expect-error revoke takes the token of a session
revoke.mutate();
// @ts-expect-error unwrapAuth needs the message for an error without one
unwrapAuth({ data: null, error: null });
</script>

<template>
  <p>
    {{ sessionsAreTyped }} {{ revokeIsTyped }} {{ revokeErrorIsTyped }} {{ revokeOthersIsTyped }} {{ revokeOthersErrorIsTyped }}
    {{ changeEmailIsTyped }} {{ changeEmailErrorIsTyped }} {{ requestedIsTyped }} {{ totpUriIsTyped }} {{ enableErrorIsTyped }}
    {{ verifyIsTyped }} {{ verifyErrorIsTyped }} {{ disableIsTyped }} {{ disableErrorIsTyped }} {{ backupCodesAreTyped }}
    {{ resendIsTyped }} {{ resendErrorIsTyped }} {{ unwrapIsTyped }}
    {{ sessionsListIsNotAny }} {{ twoFactorEnableIsNotAny }} {{ changeEmailIsNotAny }} {{ resendVerificationIsNotAny }}
  </p>
</template>
