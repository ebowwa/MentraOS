import { INetworkTransport } from "./INetworkTransport";
import { IStorage } from "./IStorage";
import { IHardware } from "./IHardware";

export interface IPlatform {
    transport: INetworkTransport;
    storage: IStorage;
    hardware: IHardware;
}
