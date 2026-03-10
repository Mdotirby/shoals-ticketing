-- Update Renaissance Shoals Resort venue with directions and parking info
-- Run this in the Supabase SQL Editor

UPDATE event_venues 
SET 
  directions_by_car = 'From Sheffield/Muscle Shoals: Take US-72 East toward Florence. Cross the O''Neal Bridge and turn right onto Veterans Drive. The Renaissance Shoals Resort & Spa will be about 2 miles and on your right.

From Rogersville: Take US-72 West through Killen. Continue on US-72 W/AL-2 into Florence. Turn left onto Cox Creek Parway. The Renaissance Shoals Resort & Spa will be on your right.

From Savannah, TN: Take US-64 West to Lawrenceburg, then take US-43 South to Florence. Once in Florence, head toward downtown on US-72. The Renaissance Shoals Resort & Spa will be on your left.',
  parking_info = 'Free self-parking is available in the resort''s Conference Center parking lot. Valet parking is available at the front entrance of the Hotel. The lot is well-lit and accessible from Cox Creek or Veterans Drive. Overflow parking is available across the street.'
WHERE name ILIKE '%Renaissance Shoals%' OR name ILIKE '%Shoals Ballroom%';
