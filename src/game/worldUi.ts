/** Tiny UI bridge for the Living World: the canvas engine publishes, React renders. Never persisted. */
import {create} from 'zustand';
import type {EventKind} from '../core/world';
export interface CardOption {id:string;label:string;detail:string;color?:string}
export interface WorldCard {key:string;kind:EventKind;tag:string;title:string;text:string;options:CardOption[];pass:string;left:number;total:number}
export interface WorldUi {card:WorldCard|null;boon:{name:string;short:string;color:string}|null;gift:boolean;weather:string}
export const useWorld=create<WorldUi>(()=>({card:null,boon:null,gift:false,weather:''}));
