import { AppI } from "@augmentos/sdk";

const systemApps = {
  dashboard: {
    host: "dashboard-manager",
    packageName: 'system.augmentos.dashboard',
    name: 'Dashboard',
    description: "Dashboard",
    isSystemApp: true,
  },
};

// Check if deployed on porter. if so we need to modify the hosts with the porter env prefix.
// seems like we gotta do: augmentos-cloud-dev-live-captions.default.svc.cluster.local:80
// aka <PORTER_APP_NAME>-<app.host>.default.svc.cluster.local:<app.port (default:80)>
// this is because porter doesn't support the use of the default host names the same way docker-compose does.
// The default host names are used for the system apps in the docker-compose file.
// In cloud environments i.e production, development, staging: the system apps are deployed as services in the porter cluster.

for (const app of Object.values(systemApps)) {

  // Add public Url

  // @ts-ignore
  (app as any).publicUrl = "http://" + app.host;
  // if the app is already using the porter host, skip it
  // @ts-ignore
  if ((app as any).skipPorterHostUpdate) {
    console.log(`⚡️⚡️⚡️⚡️⚡️ Skipping porter host update for ${app.name} ||| HOST ||| (${app.host}) ⚡️⚡️⚡️⚡️⚡️`);
    continue;
  }

  if (process.env.PORTER_APP_NAME) {
    app.host = `${process.env.PORTER_APP_NAME}-${app.host}.default.svc.cluster.local:${process.env.PORTER_APP_PORT || 80}`;
    console.log(`⚡️ System app ${app.name} host: ${app.host}`);
  }
}

export { systemApps };
export default systemApps;