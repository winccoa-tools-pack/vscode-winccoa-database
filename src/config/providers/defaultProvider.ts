import { RuntimeLinkProvider } from './base';

export class DefaultProvider extends RuntimeLinkProvider {
    constructor() {
        super('_default', '_default');
    }
}
