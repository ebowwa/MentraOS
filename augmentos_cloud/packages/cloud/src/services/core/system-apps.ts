const systemApps = {
  captions: {
    host: "live-captions",
    packageName: "com.augmentos.livecaptions",
    name: "Live Captions",
    description: "Live closed captions.",
  },
  flash: {
    host: "flash",
    packageName: 'org.augmentos.flash',
    name: 'Flash ⚡️',
    description: "⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️",
  },
  dashboard: {
    host: "dashboard-manager",
    packageName: 'com.augmentos.dashboard',
    name: 'Dashboard',
    description: "Dashboard",
  },
  notify: {
    host: "notify",
    packageName: 'com.augmentos.notify',
    name: 'Notify',
    description: "See your phone notifications on your smart glasses",
  },
  mira: {
    host: "mira",
    packageName: 'com.augmentos.miraai',
    name: 'Mira AI',
    description: "The AugmentOS AI Assistant. Say 'Hey Mira...' followed by a question or command.",
  },
  merge: {
    host: `merge`,
    packageName: 'com.mentra.merge',
    name: 'Merge',
    description: "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo.",
  },
  teleprompter: {
    host: `teleprompter`,
    packageName: 'com.augmentos.teleprompter',
    name: 'Teleprompter',
    description: "Teleprompter for live presentations.",
  },
  liveTranslation: {
    host: "live-translation",
    packageName: 'com.augmentos.live-translation',
    name: 'Live Translation',
    description: "Live language translation."
  },
};

// Check if deployed on porter. if so we need to modify the hosts with the porter env prefix.
if (process.env.PORTER_APP_NAME) {
  for (const app of Object.values(systemApps)) {
    app.host = `${process.env.PORTER_APP_NAME}-${app.host}`;
  }
}

export { systemApps };
export default systemApps;