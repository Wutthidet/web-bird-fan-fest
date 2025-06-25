import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Zone {
  id: string;
  type: 'inner' | 'middle' | 'outer';
  gridPosition?: { x: number; y: number };
}

@Component({
  selector: 'app-zone-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zone-map.component.html',
  styleUrls: ['./zone-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZoneMapComponent implements AfterViewInit {
  @ViewChild('svgMap') svgMapRef!: ElementRef<SVGElement>;

  @Input() currentSelectedZone: string = '';
  @Output() zoneClick = new EventEmitter<string>();

  readonly zoneData: ReadonlyArray<Zone> = [
    { id: 'A1', type: 'inner' }, { id: 'A2', type: 'inner' }, { id: 'A3', type: 'inner' }, { id: 'A4', type: 'inner' },
    { id: 'B1', type: 'inner' }, { id: 'B2', type: 'inner' }, { id: 'B3', type: 'inner' }, { id: 'B4', type: 'inner' },
    { id: 'C1', type: 'inner' }, { id: 'C2', type: 'inner' }, { id: 'C3', type: 'inner' },
    { id: 'SB', type: 'middle' }, { id: 'SC', type: 'middle' }, { id: 'SD', type: 'middle' }, { id: 'SE', type: 'middle' },
    { id: 'SF', type: 'middle' }, { id: 'SG', type: 'middle' }, { id: 'SH', type: 'middle' }, { id: 'SI', type: 'middle' },
    { id: 'SJ', type: 'middle' }, { id: 'SK', type: 'middle' }, { id: 'SL', type: 'middle' }, { id: 'SM', type: 'middle' }, { id: 'SN', type: 'middle' },
    { id: 'B', type: 'outer' }, { id: 'C', type: 'outer' }, { id: 'D', type: 'outer' }, { id: 'E', type: 'outer' },
    { id: 'F', type: 'outer' }, { id: 'G', type: 'outer' }, { id: 'H', type: 'outer' }, { id: 'I', type: 'outer' },
    { id: 'J', type: 'outer' }, { id: 'K', type: 'outer' }, { id: 'L', type: 'outer' }, { id: 'M', type: 'outer' },
    { id: 'N', type: 'outer' }, { id: 'O', type: 'outer' }, { id: 'P', type: 'outer' }, { id: 'Q', type: 'outer' },
    { id: 'R', type: 'outer' }, { id: 'S', type: 'outer' }, { id: 'T', type: 'outer' }
  ];

  ngAfterViewInit() {
    setTimeout(() => {
      this.positionZoneLabels();
    }, 100);
  }

  onZoneClick(zoneName: string): void {
    this.zoneClick.emit(zoneName);
  }

  private positionZoneLabels(): void {
    const svg = this.svgMapRef?.nativeElement;
    if (!svg) return;

    this.zoneData.forEach(zone => {
      const path = svg.querySelector(`path[data-zone="${zone.id}"]`) as SVGPathElement;
      if (path && !svg.querySelector(`.zone-label[data-zone-id="${zone.id}"]`)) {
        try {
          const bbox = path.getBBox();
          if (bbox.width === 0 && bbox.height === 0) return;

          const centerX = bbox.x + bbox.width / 2;
          const centerY = bbox.y + bbox.height / 2;

          const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textElement.setAttribute('x', centerX.toString());
          textElement.setAttribute('y', centerY.toString());
          textElement.setAttribute('text-anchor', 'middle');
          textElement.setAttribute('dominant-baseline', 'central');
          textElement.classList.add('zone-label', `${zone.type}-label`);
          textElement.setAttribute('data-zone-id', zone.id);
          textElement.textContent = zone.id;

          svg.appendChild(textElement);
        } catch (error) {
          console.warn(`Could not position label for zone ${zone.id}:`, error);
        }
      }
    });
  }
}