import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExplorerPage } from './explorer.page';

describe('ExplorerPage', () => {
  let component: ExplorerPage;
  let fixture: ComponentFixture<ExplorerPage>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(ExplorerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
