any moving of folders should be done with git mv so we maintain git history.

- `cloud/developer-porter` should be renamed `console` and moved to `cloud/websites`

- cloud/store/web should be renamed to store and moved to cloud/websites

- All routes in `cloud/packages/cloud/src/routes` are sloppy 
  - see `cloud/packages/cloud/src/api/spec.md`

- `cloud/cloud-client` should be moved to `cloud/packages/cloud-client`

- `cloud/packages/cloud/src/services/session/AppManager` is very sloppy, and confusing. Maybe each running app should have it's own "manager" keeping track of it's own state, it's own subscriptions, it's own websocket keep alive / recovery. this would help simplify / reduce the complxity of a lot of the derived state and allows us to git rid of the subscription manager.

- `cloud/packages/cloud/src/services/session/SubscriptionManager` previously known as the subscription service, the cause of most cloud related bugs.

- azure STT is still around as a fallback, but we should completely remove it, and reduce complexity of the 
`cloud/packages/cloud/src/services/session/transcription` and
`cloud/packages/cloud/src/services/session/translation`

- `cloud/packages/cloud/src/services/session/SessionService` needs to be deleted, any functionality here should be in `cloud/packages/cloud/src/services/session/UserSession` or within a Manager inside of UserSession.

- `cloud/packages/cloud/src/services/session/SessionStorage` is not needed and logic should be static map / functions in UserSession class.

