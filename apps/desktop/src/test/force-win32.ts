// Exercise application branches; the host filesystem remains native.
Object.defineProperty(process, 'platform', {value:'win32', configurable:true});
