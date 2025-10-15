import { readFirebaseData } from './lib/firebase';

// Debug script to fetch Firebase logo URL
const path = '/clients/Fortress_Fund/204_Oxford_(Thrupps_Illovo_Centre)/projectLogoUrl';

readFirebaseData(path).then(data => {
  console.log('Logo URL from Firebase:', data);
}).catch(err => {
  console.error('Error fetching logo:', err);
});
