import { INetworkTransport } from './network';
import { IStorage } from './storage';
import { IMedia } from './media';
import { IHardware } from './hardware';
import { ISystem } from './system';

export interface IPlatform {
    network: INetworkTransport;
    storage: IStorage;
    media: IMedia;
    hardware: IHardware;
    system: ISystem;
}
