/**
 * socketEventRouter.story.spec.ts
 *
 * Unit test for story.* event routing in socketEventRouter.
 * Verifies that the 4 moments events are routed to momentsService.handleEvent().
 */

// Mock dependencies before importing the module under test
jest.mock('../../socket/SocketService', () => ({
  socketService: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../../db/messageRepository', () => ({
  applySocketEvent: jest.fn(),
}));

jest.mock('../../db/conversationRepository', () => ({
  bumpFromMessage: jest.fn(),
}));

jest.mock('../../moments/momentsService', () => ({
  momentsService: {
    handleEvent: jest.fn(),
  },
}));

import { socketService } from '../../socket/SocketService';
import { momentsService } from '../../moments/momentsService';
import { wireSocketEvents } from '../socketEventRouter';

describe('socketEventRouter — story events', () => {
  let unwire: () => void;
  const onMock = socketService.on as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    unwire = wireSocketEvents();
  });

  afterEach(() => {
    unwire();
  });

  const STORY_EVENTS = ['story.new', 'story.deleted', 'story.mention', 'story.reaction'];

  it('registers handlers for all 4 story events', () => {
    const registeredEvents = onMock.mock.calls.map(([event]) => event);
    for (const event of STORY_EVENTS) {
      expect(registeredEvents).toContain(event);
    }
  });

  it('routes story.new to momentsService.handleEvent', () => {
    // Find the handler registered for 'story.new'
    const call = onMock.mock.calls.find(([event]) => event === 'story.new');
    expect(call).toBeDefined();
    const handler = call![1] as (data: unknown) => void;

    const payload = { storyId: 's1', authorId: 'a1', mediaType: 'image', createdAt: '2025-01-01' };
    handler(payload);

    expect(momentsService.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'story.new', storyId: 's1', authorId: 'a1' }),
    );
  });

  it('routes story.deleted to momentsService.handleEvent', () => {
    const call = onMock.mock.calls.find(([event]) => event === 'story.deleted');
    expect(call).toBeDefined();
    const handler = call![1] as (data: unknown) => void;

    handler({ storyId: 's2', authorId: 'a2' });

    expect(momentsService.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'story.deleted', storyId: 's2' }),
    );
  });

  it('routes story.reaction to momentsService.handleEvent', () => {
    const call = onMock.mock.calls.find(([event]) => event === 'story.reaction');
    expect(call).toBeDefined();
    const handler = call![1] as (data: unknown) => void;

    handler({ storyId: 's3', viewerId: 'v1', emoji: '❤️' });

    expect(momentsService.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'story.reaction', emoji: '❤️' }),
    );
  });

  it('deregisters story event handlers on unwire', () => {
    const offMock = socketService.off as jest.Mock;
    unwire();
    const deregisteredEvents = offMock.mock.calls.map(([event]) => event);
    for (const event of STORY_EVENTS) {
      expect(deregisteredEvents).toContain(event);
    }
  });
});
