// Must be first: provides crypto.getRandomValues for key generation and message ids
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
