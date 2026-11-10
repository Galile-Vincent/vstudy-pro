import React from 'react';
import { createRoot } from 'react-dom/client';
import { PageHeader, Button } from '../../src/renderer/components/ui';
import '../../src/renderer/courses/webview.css';
import '../../src/renderer/web-chat/web-chat.css';
import '../../src/renderer/courses/planner.css';
import '../../src/renderer/review/review.css';

export function mount() {
 const host = document.createElement('div');
 document.body.replaceChildren(host);
 createRoot(host).render(<>
  <div className="moodle-webview-pane moodle-tab-page" style={{height: 240}}>
   <PageHeader className="moodle-webview-header" title="A long Moodle course resource title that must stay on one line in compact native webview chrome" description="Course materials" actions={<Button>Close</Button>}/>
  </div>
  <div className="web-chat-toolbar"><Button>Back</Button><Button>Reload</Button><span>ChatGPT<small>Session</small></span><Button>Clear</Button></div>
  <div className="planner"><PageHeader title="Planner" description="Plan your week"/></div>
  <div className="review-page"><PageHeader title="Review" description="Review your learning"/></div>
 </>);
}
