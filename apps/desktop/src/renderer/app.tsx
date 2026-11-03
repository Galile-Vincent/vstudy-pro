import { AppShell, HomePlaceholder, useNavigate } from './shell';
import { Workspace } from './workspace';
function Views() { const {route}=useNavigate(); return route.view === 'workspace' ? <Workspace/> : <HomePlaceholder/>; }
export function App() { return <AppShell><Views/></AppShell>; }
