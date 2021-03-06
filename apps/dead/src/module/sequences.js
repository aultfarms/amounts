import _ from 'lodash';
import { set } from 'cerebral/operators';
import { state,props } from 'cerebral/tags';
import { sequence, parallel } from 'cerebral';

import * as treatments from 'aultfarms-lib/treatments/module/sequences';
import * as incoming   from 'aultfarms-lib/incoming/module/sequences';
import * as dead       from 'aultfarms-lib/dead/module/sequences';
import * as trello     from 'aultfarms-lib/trello/module/sequences';
import * as windowSize from 'aultfarms-lib/windowSize/module/sequences';

import { tagHelpers } from 'aultfarms-lib/util';

export const updateMsg = sequence('updateMsg', [
  ({props,store,get}) => {
    if (props.msg) return store.set(state`msg`, props.msg);
    if (!get(state`trello.authorized`)) 
      return store.set(state`msg`, { type: 'bad', text: 'You are not logged in to Trello.' });
    if (get(state`record.is_saved`)) 
      return store.set(state`msg`, { type: 'good', text: 'Dead record saved.'});
    store.set(state`msg`, { type: 'bad', text: 'Dead record not saved'});
  },
]);

export const historySelectionChangeRequested = sequence('app.historySelectionChangeRequested', [ 
  set(state`historySelector.active`, props`active`), 
]);
export const historyGroupSortClicked = sequence('app.historyGroupSortClicked', [ 
  set(state`historyGroup.sort`, props`sort`) 
]);

export const changeRecord = sequence('app.changeRecord', [ 
  ({props,store,get}) => {
    // Only the first time that the is_saved gets set to false, automatically
    // switch the Date/Tag pane to Tag since we're typing a tag now.
    // Different from Treatments app, just changing the date doesn't swap the view
    if (get(state`record.is_saved`) && props.tag) store.set(state`historySelector.active`, 'tag');
    // if they are changing a record that has already been saved, go ahead and clear out
    // the date box for them
    if (props.date) store.set(state`record.date`, props.date);
    if (props.tag && typeof props.tag.color === 'string') {
      store.set(state`record.tag.color`, props.tag.color);
      if (props.tag.color === 'NOTAG') store.set(state`record.tag.number`,'1');
    }
    if (props.tag && (typeof props.tag.number === 'string' || typeof props.tag.number === 'number')) {
      store.set(state`record.tag.number`, +(props.tag.number));
    }
    // Now, get the current tag from the state and compute the group:
    if (props.tag) {
      const g = tagHelpers.groupForTag(get(state`incoming.records`),get(state`record.tag`),get(state`record.date`));
      const sg = get(state`record.group`);
      // If there's anything different, change the state to the new group info
      if (!(sg && g && sg.groupname === g.groupname)) store.set(state`record.group`,_.cloneDeep(g))
    }

    // if we changed the tag, then mark it as unsaved.  Otherwise, it was just the date
    // and we don't want that to be equivalent to un-saving the tag.
    if (props.tag) {
      store.set(state`record.is_saved`, false);
    }
  },
  updateMsg,
]);
export const logout = sequence('app.logout', [ trello.deauthorize, trello.authorize]);

export const saveRecord = sequence('app.saveRecord', [ 
  set(props`record`, state`record`),
  set(state`recordsValid`, false),
  set(state`msg`, { type: 'good', text: 'Saving card...' }),
  dead.saveDead, // saveDead now will update the single record in-place without fetching all
  set(state`msg`, { type: 'good', text: 'Refreshing records...' }),
//  dead.fetch,
  set(state`recordsValid`, true),
  set(state`record.is_saved`, true),
  set(state`record.tag.number`, ''),
  set(state`historySelector.active`, 'date'),
  set(state`msg`, { type: 'good', text: 'Recomputing stats...' }),
  incoming.computeStats,
  updateMsg,
]);

export const init = sequence('app.init', [
  windowSize.init,
  set(state`msg`, { type: 'good', text: 'Checking trello authorization...' }),
  trello.authorize,
  set(state`msg`, { type: 'good', text: 'Fetching records...' }),
  // Get the groups first, because all the tags only make sense once you know the groups:
  incoming.fetch,
  parallel('app.init.parallel', [
    treatments.fetch,
    treatments.fetchConfig,
    dead.fetch,
  ]),
  set(state`msg`, { type: 'good', text: 'Computing stats...' }),
  incoming.computeStats,
  set(state`recordsValid`, true),
  set(state`msg`, { type: 'good', text: 'Loaded successfully.'}),
]);
