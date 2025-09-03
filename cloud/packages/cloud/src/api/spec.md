# Api Spec

Author: Isaiah

## Overview
Most of the current api routes and handlers are current defined under `./src/routes`
As the project has grown it has become very unorganized and most files invent their own middleware
or have unclear confusing and conflicting names for their routes and handlers.
Most endpoints are used by different services and small changes cause frequent bugs from building on top of old logic that has changed drasticly
In an effort to fix these issues and better organize the routes, the goal is to slowly refactor and migrate the improved routes and endpoints under this api folder in a more oganized way.
