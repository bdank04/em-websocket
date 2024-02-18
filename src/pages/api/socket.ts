import { NextApiResponseServerIo } from "@/types/NextApiResponseServerIo";
import { Events, InitialData, SEPCPushConnector, TCPEvents, UpdateData, pushListenTo } from "@everymatrix/om-connector";
import { Entity, SubscribeData } from "@everymatrix/om-connector/lib/core/messages.types";
import { Server as NetServer } from "http";
import { NextApiRequest } from "next";
import { Server as ServerIO } from "socket.io";

class MyPushConnector extends SEPCPushConnector {
    constructor(hostName: string, port: string, ioServer: ServerIO) {
        super(hostName, port);
        this.webSocketServer = ioServer;
    }

    lastAppliedEntityChangeBatchUuid: string = "";
    webSocketServer: ServerIO | null = null;

    notifyInitialDump(initialData: InitialData) {
        this.webSocketServer?.emit("notifyInitialDump", initialData);
    }

    notifyEntityUpdates(updateData: UpdateData) {
        this.webSocketServer?.emit("notifyEntityUpdates", updateData);
        this.lastAppliedEntityChangeBatchUuid = updateData.batchUuid;
    }
    getLastAppliedEntityChangeBatchUuid() {
        return this.lastAppliedEntityChangeBatchUuid;
    }
}

// mock object for testing
// TODO: DELETE
class MockMyPushConnector {
    constructor(hostName: string, port: string, ioServer: ServerIO) {
        this.webSocketServer = ioServer;
    }

    webSocketServer: ServerIO | null = null;

    interval1: any = null;
    interval2: any = null;

    notifyInitialDump() {
        const generateMockData = (numEntities: number): InitialData => {
            const entities: Entity[] = [];
            for (let i = 0; i < numEntities; i++) {
                entities.push({
                    entityClass: "User",
                    name: `User${i + 1}`,
                    typeId: `${i + 1}`,
                    id: `${i + 1000}`,
                    version: 100 + i
                });
            }
            return {
                dumpComplete: true,
                entities,
                batchId: "42",
                batchesLeft: "4242"
            };
        };

        this.interval2 = setInterval(() => {
            this.webSocketServer?.emit("notifyInitialDump", generateMockData(15));
        }, 10000);
    }

    notifyEntityUpdates() {
        const generateMockData = (numEntities: number): UpdateData => {
            const changes: Entity[] = [];
            for (let i = 0; i < numEntities; i++) {
                changes.push({
                    entityClass: "Change",
                    name: `Change${i + 1}`,
                    typeId: `${i + 1}`,
                    id: `${i + 42}`,
                    version: 50 + i
                });
            }

            return {
                createdTime: new Date().toISOString(),
                changes,
                batchId: "24",
                batchUuid: "2424"
            };
        };

        this.interval1 = setInterval(() => {
            this.webSocketServer?.emit("notifyEntityUpdates", generateMockData(20));
        }, 6000);
    }

    getLastAppliedEntityChangeBatchUuid() {
        return "this.lastAppliedEntityChangeBatchUuid";
    }

    start(subscriptionName: string) {
        this.notifyEntityUpdates();
        this.notifyInitialDump();
        console.log("Mock connector started");
    }

    stop() {
        clearInterval(this.interval1);
        clearInterval(this.interval2);
        console.log("Mock connector stopped");
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponseServerIo) {

    if (res.socket.server.io) {
        res.end()
    }

    const httpServer: NetServer = res.socket.server as any;

    const io = new ServerIO(httpServer, {
        path: "/api/socket",
        maxHttpBufferSize: 5e6 // 5MB, defines how many bytes a single message can be, before closing the socket
    });

    const pushConnector = new MyPushConnector(
        process.env.PUSH_CONNECTOR_HOSTNAME!,
        process.env.PUSH_CONNECTOR_PORT!,
        io);

    // test data
    // TODO: DELETE
    // const pushConnector = new MockMyPushConnector(
    //     process.env.PUSH_CONNECTOR_HOSTNAME!,
    //     process.env.PUSH_CONNECTOR_PORT!,
    //     io);

    let pushConnectorStarted = false;

    pushListenTo(TCPEvents.Subscribe, (subscribeData: SubscribeData) => {
        // send to the client(?)
        console.log("TCPEvents.Subscribe", subscribeData);
    });

    pushListenTo(Events.RuntimeError, (error) => {
        console.log('Events.RuntimeError', error);
    })

    io.on('connection', (socket) => {
        if (!pushConnectorStarted) {
            // start pushConnector only when the first user is connected
            pushConnector.start(process.env.PUSH_CONNECTOR_SUBSCRIPTION_NAME!);
            pushConnectorStarted = true;
        }

        socket.on('disconnect', () => {
            // pushConnector stops only after the last user is disconnected
            if (io.engine.clientsCount === 0) {
                pushConnector.stop();
                pushConnectorStarted = false;
            }
        });
    });

    res.socket.server.io = io;
    res.end();
}