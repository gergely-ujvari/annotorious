goog.provide('annotorious.hypo.Popup');

/**
 * A wrapper around the Hypo viewer popup, mimicking the Annotorious Popup.
 * @param {element} image the image
 * @param {annotorious.events.EventBroker} eventBroker reference to the Yuma EventBroker
 * @param {Annotator} hypoGuest reference to the Hypothes.is Guest instance
 * @constructor
 */
annotorious.hypo.Popup = function(image, hypoGuest, eventBroker) {
  /** @private **/
  this._image = image;

  /** @private **/
  this._hypoGuest = hypoGuest;

  /** @private **/
  this._eventBroker = eventBroker;

  var self = this;
}

/**
 * Show the popup, loaded with the specified annotation, at the specified coordinates.
 * @param {annotorious.Annotation} annotation the annotation
 * @param {annotorious.shape.geom.Point} xy the viewport coordinate
 */
annotorious.hypo.Popup.prototype.show = function(annotation, xy) {

}

/**
 * Start the popup hide timer.
 */
annotorious.hypo.Popup.prototype.startHideTimer = function() {

}
