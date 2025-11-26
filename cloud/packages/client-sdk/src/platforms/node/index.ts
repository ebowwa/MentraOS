import { IPlatform } from "../../interfaces/IPlatform";
import { NodeTransport } from "./NodeTransport";
import { FileStorage } from "./FileStorage";
import { MockHardware } from "./MockHardware";

export class NodePlatform implements IPlatform {
    transport = new NodeTransport();
    storage = new FileStorage();
    hardware = new MockHardware();
}
