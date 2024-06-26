import { MCP_AUTH_KEY } from './constants';

import {
    TelnetMessageSender,
    ConnectionStateChanger,
    ConnectionState
} from '../interfaces';

import { McpMessageHandler } from './mcp-message-handler';

// TODO: make more generic than simpleedit-content

class MultilineResult {
    public reference = '';
    public name = '';
    public lines: string[] = [];
}

class MultilineData {
    private dataTag: string;
    private data: MultilineResult;

    constructor(reference: string, name: string, dataTag: string) {
        this.data = { reference: reference, name: name, lines: [] };
        this.dataTag = dataTag;
    }

    private hasFinished(): boolean {
        if (this.dataTag === '') {
            return true;
        }

        return false;
    }

    public getDataTag(): string {
        return this.dataTag;
    }

    public finish() {
        this.dataTag = '';
    }

    public addLine(line: string) {
        if (this.dataTag === '') {
            throw Error('multiline data not started');
        }

        this.data.lines.push(line);
    }

    public getData(): MultilineResult {
        if (!this.hasFinished()) {
            throw Error('multiline data not finished');
        }

        return this.data;
    }
}

export class McpMultilineHandler extends McpMessageHandler {
    private regexPattern_multiline_start = `^#\\$#dns-org-mud-moo-simpleedit-content ${MCP_AUTH_KEY} reference: \\"([^\\"]+)\\" name: \\"([^\\"]+)\\" type: moo-code content\\*: \\"\\" _data-tag: (\\d+)$`;

    private memory: MultilineData[] = [];

    private connectionStateChanger: ConnectionStateChanger;

    constructor(sender: TelnetMessageSender, connectionStateChanger: ConnectionStateChanger) {
        super(sender);
        
        this.connectionStateChanger = connectionStateChanger;
    }
    
    public handle(message: string): boolean {
        if (this.handleStart(message)) {
            return true;
        }

        if (this.handleContinue(message)) {
            return true;
        }

        if(this.handleEnd(message)) {
            return true;
        }

        return false;
    }

    private handleStart(message: string): boolean {
        const regex = new RegExp(this.regexPattern_multiline_start, '');
        const match = regex.exec(message);
        if (!match) {
            return false;
        }

        const reference = match[1];
        const name = match[2];
        const dataTag = match[3];

        const existingMultilineData = this.memory.find(x => x.getDataTag() === dataTag);
        if (existingMultilineData) {
            throw Error(`found existing data for tag: ${dataTag}`);
        }
        
        this.memory.push(new MultilineData(reference, name, dataTag));

        return true;
    }

    private handleContinue(message: string): boolean {
        const match = message.match(/^#\$#\* (\d+) content: (.*)$/);
        if (!match) {
            return false;
        }

        const dataTag = match[1];
        const data = match[2];

        const existingMultilineData = this.memory.find(x => x.getDataTag() === dataTag);
        if (!existingMultilineData) {
            throw Error(`found no data for tag: ${dataTag}`);
        }

        existingMultilineData.addLine(data);

        return true;
    }

    private handleEnd(message: string): boolean {
        const match = message.match(/^#\$#: (\d+)$/);
        if (!match) {
            return false;
        }

        const dataTag = match[1];

        const existingMultilineData = this.memory.find(x => x.getDataTag() === dataTag);
        if (!existingMultilineData) {
            throw Error(`found no data for tag: ${dataTag}`);
        }

        existingMultilineData.finish();

        const multilineData = existingMultilineData.getData();
        const stateData = { reference: multilineData.reference,
            name: multilineData.name, lines: multilineData.lines };
        this.connectionStateChanger.changeState(ConnectionState.multilineResult, stateData);

        return true;
    }
}