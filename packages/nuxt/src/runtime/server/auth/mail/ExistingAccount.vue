<template>
  <MailLayout :preview="$t('nuxvel.auth.existingAccount.preview')">
    <EHeading>{{ $t("nuxvel.auth.existingAccount.heading") }}</EHeading>
    <EText>{{ $t("nuxvel.auth.existingAccount.body") }}</EText>
    <EText>{{ $t("nuxvel.auth.existingAccount.signIn") }}</EText>
    <EText font-size="14px" color="#6b7280">{{ $t("nuxvel.auth.existingAccount.ignore") }}</EText>
  </MailLayout>
</template>
