type Messages = Record<string, unknown>;

export const nuxvelMessages: Record<string, Messages> = {
  en: {
    nuxvel: {
      mail: { sentBy: "Sent by {name}." },
      auth: {
        verifyEmail: {
          subject: "Confirm your email address",
          preview: "Confirm your email address.",
          heading: "Confirm your email address",
          body: "Hi, open the link below to confirm your email address. The link expires in 24 hours.",
          button: "Confirm email address",
          ignore: "If you did not create an account, ignore this mail.",
        },
        resetPassword: {
          subject: "Reset your password",
          preview: "Reset your password.",
          heading: "Reset your password",
          body: "Hi {name}, open the link below to choose a new password. The link works once and expires in 1 hour.",
          button: "Choose a new password",
          ignore: "If you did not ask for this, ignore this mail. Your password stays the same.",
        },
        securityNotice: {
          subject: "Security notice for your account",
          heading: "Security notice",
          greeting: "Hi {name},",
          password: "The password of your account changed.",
          email:
            "Someone asked to move your account to a new email address. The address changes when someone opens the link that went to the new address.",
          emailApproval:
            "Someone asked to move your account to a new email address. The address changes only after you approve it with the link below and the new address confirms it. The link expires in 24 hours.",
          "new-sign-in": "Someone signed in to your account from a device it has not seen before.",
          "two-factor-on": "Two-factor sign-in is now on for your account.",
          "two-factor-off": "Two-factor sign-in is now off for your account.",
          device: "Device: {device}",
          button: "Approve the change",
          notYouApproval: "If this was not you, do not open the link. Reset your password now.",
          notYou: "If this was you, you need to do nothing. If it was not, reset your password now.",
        },
        existingAccount: {
          subject: "You already have an account",
          preview: "Someone tried to sign up with your email address.",
          heading: "You already have an account",
          body: "Hi, someone tried to create an account with your email address. You already have one, so nothing changed.",
          signIn: "If this was you, sign in with your password. If you forgot it, reset it from the sign-in page.",
          ignore: "If this was not you, ignore this mail.",
        },
      },
    },
  },
  zh: {
    nuxvel: {
      mail: { sentBy: "由 {name} 发送。" },
      auth: {
        verifyEmail: {
          subject: "请确认您的电子邮件地址",
          preview: "请确认您的电子邮件地址。",
          heading: "确认您的电子邮件地址",
          body: "您好，请打开下面的链接，确认您的电子邮件地址。链接在 24 小时后失效。",
          button: "确认电子邮件地址",
          ignore: "如果您没有创建账户，请忽略此邮件。",
        },
        resetPassword: {
          subject: "重置您的密码",
          preview: "重置您的密码。",
          heading: "重置您的密码",
          body: "{name}，您好！请打开下面的链接，设置新密码。链接只能使用一次，并在 1 小时后失效。",
          button: "设置新密码",
          ignore: "如果您没有提出此请求，请忽略此邮件。您的密码不会改变。",
        },
        securityNotice: {
          subject: "您账户的安全通知",
          heading: "安全通知",
          greeting: "{name}，您好：",
          password: "您账户的密码已更改。",
          email: "有人请求把您的账户改到一个新的电子邮件地址。有人打开发送到新地址的链接后，地址即会更改。",
          emailApproval:
            "有人请求把您的账户改到一个新的电子邮件地址。只有在您用下面的链接批准、并且新地址确认之后，地址才会更改。链接在 24 小时后失效。",
          "new-sign-in": "有人从一台新设备登录了您的账户。",
          "two-factor-on": "您的账户已开启两步验证登录。",
          "two-factor-off": "您的账户已关闭两步验证登录。",
          device: "设备：{device}",
          button: "批准更改",
          notYouApproval: "如果这不是您本人的操作，请不要打开链接，并立即重置密码。",
          notYou: "如果这是您本人的操作，您无需做任何事。如果不是，请立即重置密码。",
        },
        existingAccount: {
          subject: "您已经有账户了",
          preview: "有人尝试用您的电子邮件地址注册。",
          heading: "您已经有账户了",
          body: "您好，有人尝试用您的电子邮件地址创建账户。您已经有一个账户，因此没有任何更改。",
          signIn: "如果是您本人，请用密码登录。如果忘记了密码，请在登录页面重置。",
          ignore: "如果不是您本人，请忽略此邮件。",
        },
      },
    },
  },
};
